class ChatMessageCreate(BaseModel):
    user_id: int
    message: str
    channel: str = "global" # 'global' or 'local'

# --- Chat & Reaction Endpoints ---
@app.get("/chat")
def get_chat_messages(channel: str = "global", lat: float = None, lng: float = None):
    conn = get_raw_db()
    cursor = conn.cursor()
    
    # Auto-initialize or patch messages table with channel and coordinate columns
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            message TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            reactions TEXT DEFAULT '{}',
            channel TEXT DEFAULT 'global',
            latitude REAL,
            longitude REAL
        )
    ''')
    
    for col_def in [
        ("reactions", "TEXT DEFAULT '{}'"),
        ("channel", "TEXT DEFAULT 'global'"),
        ("latitude", "REAL"),
        ("longitude", "REAL")
    ]:
        try:
            cursor.execute(f"ALTER TABLE messages ADD COLUMN {col_def[0]} {col_def[1]}")
            conn.commit()
        except sqlite3.OperationalError:
            pass
    
    cursor.execute('''
        SELECT m.id, m.user_id, m.message, m.timestamp, m.reactions, m.channel, m.latitude, m.longitude, u.settings 
        FROM messages m
        LEFT JOIN users u ON m.user_id = u.id
        WHERE m.channel = ?
        ORDER BY m.timestamp ASC
        LIMIT 100
    ''', (channel,))
    rows = cursor.fetchall()
    conn.close()
    
    messages = []
    for row in rows:
        # If channel is local and viewer coordinates are provided, filter by 10 miles (16093.4 meters)
        if channel == "local" and lat is not None and lng is not None:
            if row["latitude"] is not None and row["longitude"] is not None:
                distance = haversine(lat, lng, row["latitude"], row["longitude"])
                if distance > 16093.4:
                    continue # Skip messages outside 10 miles
            else:
                continue # Skip if message has no location data

        owner_name = "Fellow Jeeper"
        if row["settings"]:
            try:
                settings_dict = json.loads(row["settings"])
                owner_name = settings_dict.get("ownerName", "Fellow Jeeper")
            except:
                pass
                
        try:
            reactions_dict = json.loads(row["reactions"] or "{}")
        except:
            reactions_dict = {}
                
        messages.append({
            "id": row["id"],
            "user_id": row["user_id"],
            "owner_name": owner_name,
            "message": row["message"],
            "timestamp": row["timestamp"],
            "reactions": reactions_dict,
            "channel": row["channel"]
        })
        
    return messages

@app.post("/chat")
def post_chat_message(chat: ChatMessageCreate, db: Session = Depends(get_db)):
    conn = get_raw_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            message TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            reactions TEXT DEFAULT '{}',
            channel TEXT DEFAULT 'global',
            latitude REAL,
            longitude REAL
        )
    ''')
    
    # Grab the sender's current lat/lng from the users table so local messages have location reference
    user = db.query(User).filter(User.id == chat.user_id).first()
    sender_lat = user.latitude if user else None
    sender_lng = user.longitude if user else None
    
    cursor.execute(
        "INSERT INTO messages (user_id, message, timestamp, reactions, channel, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (chat.user_id, chat.message, datetime.utcnow(), "{}", chat.channel, sender_lat, sender_lng)
    )
    conn.commit()
    msg_id = cursor.lastrowid
    conn.close()
    
    return {"id": msg_id, "status": "success"}