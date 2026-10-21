# Jtap — Epics & User Stories

Stack: FastAPI + SQLite backend, Expo React Native (TypeScript) frontend. (Epic 1 acceptance criteria previously referenced MongoDB/Django from the course template; corrected to the actual stack 2026-10-20.)

Status legend: ✅ Done · 🔄 In progress / in review · 🔨 Implemented on a branch, pending PR · 📋 Planned · 💡 Proposed

Last updated: 2026-10-20.

# Epic 0: Core Platform (shipped foundation)

The working app underneath the coursework epics — shipped on main and in daily use. These stories were previously tracked only as coarse board containers (#35–#41) or not tracked at all, and have no Given/When/Then criteria; they are recorded here so the epic map covers the whole project.

- **Story 0.1 — Account & Authentication** ✅ Done — JWT auth, bcrypt passwords, Google/Facebook/X sign-in, base user model. *(Board #35, ticket #14)*
- **Story 0.2 — Proximity Discovery** ✅ Done — nearby rigs within 5 miles (Haversine), Map tab with live distances, empty states. *(Board #36)*
- **Story 0.3 — Duck Collecting & Pond** ✅ Done — duck types, pond collection, rarity. *(Board #37)*
- **Story 0.4 — Duck Drops & Trading** ✅ Done — location drops, claiming, duck trades. *(Board #38)*
- **Story 0.5 — Milestones, Rewards & Leaderboards** ✅ Done. *(Board #39)*
- **Story 0.6 — Chat** ✅ Done — global, local, and DM channels. *(Board #40)*
- **Story 0.7 — Backend Admin Panel** ✅ Done. *(Board #41)*
- **Story 0.8 — JtapBot (LLM chatbot)** ✅ Done — LLM-backed chat bot (Ollama `llama3.2:3b` default, OpenAI optional): @-mention replies, scheduled jokes/trail tips, duck lore & drop clues. *(No board item)*
- **Story 0.9 — SOS Requests** ✅ Done — emergency request routes + mobile hooks. *(No board item)*
- **Story 0.10 — Meetups** ✅ Done — meetup routes + `meetupApi.js` client. *(No board item)*
- **Story 0.11 — Push Notifications** ✅ Done — notification routes, FCM push, in-app toast. *(No board item)*
- **Story 0.12 — Marketplace v1 (basic listings)** ✅ Done — listing CRUD, one photo, description, contact info, Market tab. Epics 3/4 are the expansion of this baseline, not a greenfield. *(No board item)*

# Epic 1: Rig Profiles & Build Comparisons (The "Garage")

This document outlines the vertical-slice user stories for Epic 1 of the Jtap application. All acceptance criteria strictly follow the Given/When/Then format to ensure requirements are testable and explicitly cover happy paths, error paths, empty states, and permission boundaries  . Unquantified adjectives have been deliberately omitted.

Story-to-ticket mapping: Setup 1.0.1 → #11, 1.0.2 → #12, 1.0.3 → #13, 1.0.4 → #14, 1.0.5 → #15; 1.1 → #16/#17/#18, 1.2 → #19/#20, 1.3 → #21/#22, 1.4 → #23/#24/#25, 1.5 → #26/#27, 1.6 → #28/#29, 1.7 → #30/#31, 1.8 → #32/#33/#34.

**Setup slice status:** 1.0.1 Initialize Backend (FastAPI) ✅ Done · 1.0.2 Environment/config 📋 Open (#12 — .env support still outstanding) · 1.0.3 Initialize Frontend (Expo) ✅ Done · 1.0.4 Auth & Base User Model ✅ Done · 1.0.5 Local Static Storage ✅ Done.

## Core Vehicle Identity

### Story 1.1: Create Base Profile
**Status:** 🔨 Implemented 2026-10-20 on stacked branches, held for PR — not yet on main. Previously ⚠️ partial via the `User.settings` blob.
*As a new app user, I want to create a base vehicle profile by inputting my rig's Year, Make, and Model, so that I have a foundation to document my specific off-road build.*

**Acceptance Criteria:**
* **Given** an authenticated user navigates to the "My Garage" tab with no existing vehicle profiles saved.
* **When** the screen loads.
* **Then** the system displays a default empty state reading "No rigs found. Add your first vehicle to get started".
* **Given** the user fills out the "Year," "Make," and "Model" text fields and clicks "Save."
* **When** the server processes the submission.
* **Then** the base profile is stored in the SQLite database, and the user is redirected to their newly created Rig Details page.
* **Given** the user is attempting to save a new base profile.
* **When** the user leaves the "Make" or "Model" fields completely blank and clicks "Save."
* **Then** the system prevents the form submission and surfaces an inline error message reading "Make and Model are required fields."

### Story 1.2: Upload Rig Photo
**Status:** 🔨 Implemented 2026-10-20 on stacked branches, held for PR — not yet on main. Previously ⚠️ partial (upload worked; no type/size guards).
*As a rig owner, I want to upload a primary photo of my vehicle, so that peers can visually identify my build.*

**Acceptance Criteria:**
* **Given** a user is on their active Rig Details page.
* **When** they select a valid JPG or PNG image under 5MB and click "Upload."
* **Then** the system saves the image and displays it as the primary header photo on the profile.
* **Given** a user attempts to upload a photo.
* **When** the selected file size exceeds the strict 5MB limit.
* **Then** the system blocks the upload and displays an error reading "File size exceeds 5MB limit"  .
* **Given** a user attempts to upload a photo.
* **When** the selected file is an unsupported format (e.g., .pdf or .gif).
* **Then** the system blocks the upload and displays an error reading "Invalid file format. Please upload a JPG or PNG".

### Story 1.3: Delete Vehicle Profile
**Status:** 🔨 Implemented 2026-10-20 on stacked branches, held for PR — not yet on main. Previously 📋 not implemented — confirmed by code audit 2026-10-20.
*As a user, I want to delete my vehicle profile, so that I can remove rigs I no longer own.*  

**Acceptance Criteria:**
* **Given** a user clicks the "Delete Profile" action on their active Rig Details page.
* **When** the button is clicked.
* **Then** the system triggers a modal overlay explicitly asking the user to confirm the permanent deletion, preventing accidental data loss.
* **Given** the user is viewing the confirmation dialog.
* **When** the user clicks "Confirm Delete."
* **Then** the system drops the rig profile from the database, redirects the user to the "My Garage" tab, and displays the "No rigs found" empty state.

## Build Tracking & Modifications

### Story 1.4: Add Modification
**Status:** 🔨 Implemented 2026-10-20 on stacked branches, held for PR — not yet on main. Previously ⚠️ partial (mods were one free-text field).
*As a rig owner, I want to add individual parts to my profile by category, so that I can track my exact build.*  

**Acceptance Criteria:**
* **Given** a rig owner is viewing their own active Rig Details page.
* **When** they click "Add Mod", select "Suspension" from the dropdown, input "2-inch lift kit", and submit.
* **Then** the database updates the document array, and the new modification instantly appears nested under the "Suspension" header on the profile UI.
* **Given** a rig owner is typing a part name into the "Add Mod" input field.
* **When** the character count exceeds 100 characters.
* **Then** the input field blocks further text entry and displays a warning stating the maximum character limit has been reached.
* **Given** a user is viewing a Rig Details page that belongs to a different account.
* **When** the profile screen loads.
* **Then** the "Add Mod" action is completely hidden from the UI, enforcing strict permission boundaries.

### Story 1.5: Edit Existing Modification
**Status:** 🔨 Implemented 2026-10-20 on stacked branches, held for PR — not yet on main. Previously ⚠️ partial (free-text editing only).
*As a rig owner, I want to update a saved modification, so that I can correct typos or update brand names.*  

**Acceptance Criteria:**
* **Given** a user clicks the "Edit" icon next to a saved modification.
* **When** they change the text from "33-inch tires" to "35-inch tires" and click "Save."
* **Then** the database updates the specific array item, and the updated text renders on the profile.
* **Given** a user is actively editing a modification.
* **When** they delete all text from the input field so it is completely empty and attempt to save.
* **Then** the system disables the save button and requires at least 1 character to be present to submit.

### Story 1.6: Remove Modification
**Status:** 🔨 Implemented 2026-10-20 on stacked branches, held for PR — not yet on main. Previously ⚠️ partial (by editing the mods text).
*As a rig owner, I want to delete a specific modification from my list, so that my build accurately reflects parts I have uninstalled.*  

**Acceptance Criteria:**
* **Given** a user clicks the "Delete" icon next to a specific modification in their list.
* **When** the action is triggered.
* **Then** the backend removes that specific item from the mods array in SQLite, and the nested item immediately disappears from the user interface.
* **Given** a user deletes the final modification listed under a specific category header (e.g., "Armor").
* **When** the item is removed.
* **Then** the system automatically hides the empty "Armor" category header from the profile view  .

## Social Visibility

### Story 1.7: View Peer Build Sheet
**Status:** 🔨 Implemented 2026-10-20 on stacked branches, held for PR — not yet on main. Was already ✅ done in substance via the settings blob (`GET /users/{id}/profile`); now also implemented per spec on the RigProfile entity.
*As a trail driver, I want to view the modification list of another public user, so that I can research their setup.*  

**Acceptance Criteria:**
* **Given** a user clicks on another driver's rig icon from the map view.
* **When** the profile data is requested.
* **Then** the FastAPI backend retrieves and renders the target user's Rig Details page within 2 seconds on a standard 4G connection.
* **Given** the user successfully loads a peer's profile.
* **When** the target user has zero modifications saved to their account.
* **Then** the modifications section displays an empty state reading "This user has not listed any modifications yet".

### Story 1.8: Privacy Toggle
**Status:** 🔨 Implemented 2026-10-20 on stacked branches, held for PR — not yet on main. Previously ⚠️ partial (`discoverable` gated search only, not profile view).
*As a driver, I want to toggle my garage profile to private, so that strangers cannot view my modification inventory.*  

**Acceptance Criteria:**
* **Given** the user navigates to their profile settings.
* **When** they switch the visibility toggle from "Public" to "Private."
* **Then** the database updates the profile's visibility state to private.
* **Given** a user attempts to view a peer's rig profile from the radar map.
* **When** the target user has configured their account privacy settings to "Private."
* **Then** the system displays a locked state reading "This rig profile is private" and strictly prevents any modification array data from being loaded or displayed.

# Epic 2: Squads (Groups / Clans)

This document outlines the vertical-slice user stories for Epic 2 of the Jtap application: named, joinable groups for the off-road community. All acceptance criteria strictly follow the Given/When/Then format to ensure requirements are testable and explicitly cover happy paths, error paths, empty states, and permission boundaries. Unquantified adjectives have been deliberately omitted.

Story-to-ticket mapping: 2.1 → #42/#43, 2.2 → #44/#45, 2.3 → #46/#47, 2.4 → #48/#49, 2.5 → #50/#51, 2.6 → #52/#53, 2.7 → #57/#58.

## Formation & Membership

### Story 2.1: Create Squad
**Status:** ✅ Done — PRs #54/#55 merged 2026-10-12.
*As a user, I want to create a squad with a name, description, and avatar, so that I can gather my off-road crew in one place.*

**Acceptance Criteria:**
* **Given** an authenticated user submits the Create Squad form with a valid name.
* **When** the server processes the submission.
* **Then** a squad is created, the creator is assigned the `leader` role, and the user is redirected to the new squad profile.
* **Given** the user attempts to create a squad.
* **When** the name field is left blank and the form is submitted.
* **Then** the system prevents submission and surfaces an inline error reading "Squad name is required."
* **Given** the user attempts to create a squad.
* **When** the chosen name is already taken by another squad.
* **Then** the API returns 400 and the form displays "That squad name is taken."

### Story 2.2: Join and Leave Squads
**Status:** 📋 Planned.
*As a user, I want to join public squads and leave squads I'm in, so that I control my own memberships.*

**Acceptance Criteria:**
* **Given** an authenticated user views a public squad they have not joined.
* **When** they tap "Join Squad."
* **Then** they become a member and the member count increments immediately.
* **Given** a user who is already a squad member.
* **When** they attempt to join the same squad again.
* **Then** the API rejects the request and their membership is unchanged.
* **Given** a squad member viewing the squad profile.
* **When** they choose "Leave" and confirm the dialog reading "Leave this squad?"
* **Then** they are removed from the squad and the member count decrements.
* **Given** the squad leader attempts to leave.
* **When** the leave request is processed.
* **Then** the API returns 400 until leadership has been transferred to another member.

### Story 2.3: Invite Members
**Status:** 📋 Planned.
*As a squad member, I want to invite other users to my squad, so that my crew can grow.*

**Acceptance Criteria:**
* **Given** a squad member viewing the squad profile.
* **When** they invite another user via the member picker.
* **Then** the invited user receives a pending invite.
* **Given** a user with a pending invite opens their invites list.
* **When** the list loads.
* **Then** each invite renders with Accept and Decline actions.
* **Given** a user with no pending invites opens their invites list.
* **When** the list loads.
* **Then** the system displays the empty state reading "No pending invites".
* **Given** a user attempts to accept or decline an invite addressed to someone else.
* **When** the request is processed.
* **Then** the API returns 403.

## Profiles & Moderation

### Story 2.4: View Squad Profile
**Status:** 📋 Planned.
*As a user, I want to view a squad's profile with its members, so that I can decide whether to join.*

**Acceptance Criteria:**
* **Given** a user opens any squad profile.
* **When** the profile loads.
* **Then** the system displays the squad avatar, name, description, member count, and member grid with roles.
* **Given** a user who is not a member attempts to view a private squad.
* **When** the profile is requested.
* **Then** the system displays a locked state reading "This squad is private" with no member list and no activity data.
* **Given** a squad member views the squad profile.
* **When** the profile loads.
* **Then** the Join/Leave button reflects their current membership state.

### Story 2.5: Manage Squad Roles
**Status:** 📋 Planned.
*As a squad leader, I want to manage roles and remove members, so that I can moderate my squad.*

**Acceptance Criteria:**
* **Given** the squad leader views the squad profile.
* **When** the profile loads.
* **Then** Edit, Remove member, Transfer leadership, and Delete squad controls are visible.
* **Given** a user who is not the squad leader views the squad profile.
* **When** the profile loads.
* **Then** the leader-only controls are not rendered at all, not merely disabled.
* **Given** the squad leader transfers leadership to another member.
* **When** the transfer is confirmed.
* **Then** the target member becomes leader and the previous leader becomes a regular member.
* **Given** the squad leader deletes the squad and confirms.
* **When** the deletion is processed.
* **Then** the squad, its memberships, and its pending invites are permanently removed.

## Engagement

### Story 2.6: Squad Activity Feed
**Status:** 📋 Planned.
*As a squad member, I want to see my squad's recent activity, so that I stay in the loop on what my crew is up to.*

**Acceptance Criteria:**
* **Given** a squad member opens the squad feed.
* **When** the feed loads.
* **Then** member events (rig created, mod added, duck dropped) render newest-first, paginated.
* **Given** a user who is not a squad member requests the feed.
* **When** the request is processed.
* **Then** the API returns 403.
* **Given** a squad with no recorded activity.
* **When** the feed loads.
* **Then** the system displays the empty state reading "No squad activity yet — be the first to post."
* **Given** a squad member viewing the feed.
* **When** they pull to refresh.
* **Then** the feed reloads from the latest events.

### Story 2.7: Squad Discovery (under Browse)
**Status:** 🔄 In review — PRs #64 (backend) / #65 (frontend) opened 2026-10-18; #65 review fixes pushed 2026-10-20.
*As a user, I want to discover squads from the Browse tab, so that I can find a crew to join without leaving the app's discovery surface.*

**Acceptance Criteria:**
* **Given** a user opens the Browse tab.
* **When** it loads.
* **Then** a People | Squads segmented control is visible, with People as the default.
* **Given** the user switches to the Squads segment.
* **When** they have squads.
* **Then** "My squads" renders above the discovery results.
* **Given** the user types in the squad search box.
* **When** the query has 2+ characters.
* **Then** results filter via `GET /squads?q=`.
* **Given** no squads match the query.
* **When** results load.
* **Then** the system displays the empty state reading "No squads found. Create one to get started."
* **Given** the user taps "Create squad".
* **When** the action fires.
* **Then** they navigate to `/squads/create`.

**Placement note:** squad discovery lives inside the Browse tab (People | Squads segmented control) rather than as a separate tab. People browsing is kept -- the squad invite flow (Story 2.3) depends on user search.

# Epic 3: Marketplace Core

This document outlines the vertical-slice user stories for Epic 3 of the Jtap application, covering the minimum viable marketplace: sellers can create and maintain listings, buyers can discover them by proximity, contact sellers, and flag abuse. All acceptance criteria strictly follow the Given/When/Then format to ensure requirements are testable and explicitly cover happy paths, error paths, empty states, and permission boundaries. Unquantified adjectives have been deliberately omitted.

**Status:** all Epic 3 stories 📋 Planned — no board tickets yet. A basic marketplace already ships as Epic 0.12; these stories are its expansion.

# Create and Edit Listings

### Story 3.1: Edit Listing After Posting
*As a seller, I want to edit my marketplace listing after posting, so that I can fix mistakes without deleting and re-creating.*

**Acceptance Criteria:**
* **Given** a seller opens their own active listing detail page.
* **When** they tap "Edit", change the price, and save.
* **Then** the backend persists the change and the new price renders on the listing detail and feed card in the same session.
* **Given** a seller is editing a listing.
* **When** they clear the title field entirely and attempt to save.
* **Then** the system prevents submission and surfaces an inline error reading "Listing title is required".
* **Given** a user views a listing posted by a different account.
* **When** the listing detail page loads.
* **Then** no edit control is rendered, enforcing the ownership boundary.

### Story 3.2: Multiple Photos Per Listing
*As a buyer, I want to swipe through several photos on a listing, so that I can inspect the item before contacting the seller.*

**Acceptance Criteria:**
* **Given** a seller uploads 3 photos while creating a listing.
* **When** a buyer opens the listing detail page.
* **Then** all 3 photos render in a swipeable carousel with a position indicator reading "1 of 3".
* **Given** a seller attempts to upload a 6th photo.
* **When** the upload is submitted.
* **Then** the system blocks the upload and displays an error reading "Maximum 5 photos per listing".
* **Given** a listing with a single photo.
* **When** the detail page loads. 
* **Then** the photo renders exactly as a single image with no carousel controls.

# Seller Dashboard

### Story 3.3: My Listings View
*As a seller, I want a "My Listings" view showing everything I have posted, so that I can manage active, sold, and expired items in one place.*

**Acceptance Criteria:**
* **Given** a signed-in seller with 2 active, 1 sold, and 1 expired listing navigates to "My Listings".
* **When** the screen loads.
* **Then** all 4 listings render, each labeled with its status and age in days.
* **Given** a signed-in seller who has never posted a listing navigates to "My Listings".
* **When** the screen loads.
* **Then** the system displays an empty state reading "No listings" with a "Create listing" call to action.
* **Given** a signed-out user.
* **When** they attempt to open "My Listings".
* **Then** the system redirects to the sign-in screen.

### Story 3.4: Listing Expiry With One-Tap Repost
*As a seller, I want my listings to expire after 30 days with a one-tap repost option, so that the marketplace does not fill with stale posts.*

**Acceptance Criteria:**
* **Given** a listing that was posted 31 days ago.
* **When** a buyer loads the marketplace feed.
* **Then** the expired listing does not appear in the feed.
* **Given** a seller opens "My Listings" on an expired item.
* **When** they tap "Repost".
* **Then** the listing becomes active again with the current date and appears in the feed.
* **Given** a listing that was posted 29 days ago.
* **When** a buyer loads the marketplace feed.
* **Then** the listing still appears in the feed.

# Listing Attributes

### Story 3.5: Condition Field on Listings
*As a seller, I want to mark my item's condition, so that buyers know what to expect.*

**Acceptance Criteria:**
* **Given** a seller creates a listing.
* **When** they select "Used" from the condition dropdown and submit.
* **Then** the condition saves and renders as a badge on the listing detail and feed card.
* **Given** a buyer opens the filter panel.
* **When** they select the "Like-new" condition filter.
* **Then** only listings marked as "Like-new" appear in the results.
* **Given** a seller submits without selecting a condition.
* **When** the form is submitted.
* **Then** the system blocks submission and surfaces an inline error reading "Item condition is required".

### Story 3.6: OBO / Trade-Offers Toggle on Price
*As a seller, I want to mark my price as "or best offer" or open to trades, so that I receive more responses.*

**Acceptance Criteria:**
* **Given** a seller enables "Or best offer" on a $300 listing.
* **When** a buyer views the feed card.
* **Then** the price renders as "$300 OBO".
* **Given** a seller enables "Open to trades".
* **When** a buyer opens the listing detail page.
* **Then** an "Open to trades" badge is visible below the price.
* **Given** a seller enables neither toggle.
* **When** a buyer views the listing.
* **Then** the price renders as a plain amount with no badges.

# Proximity Discovery

### Story 3.7: Show Distance on Each Listing
*As a buyer, I want to see how far away each listing is, so that I can decide whether pickup is realistic.*

**Acceptance Criteria:**
* **Given** a listing posted by a seller 12 miles from the buyer.
* **When** the marketplace feed card renders.
* **Then** the card displays "12 mi away".
* **Given** a seller has hidden their location via the privacy toggle.
* **When** a buyer views their listing.
* **Then** the card displays "Location hidden" instead of a distance.
* **Given** the buyer's device location permission is denied.
* **When** the feed loads.
* **Then** distance labels are omitted and a prompt reads "Enable location to see distances".

### Story 3.8: Search-Radius Filter
*As a buyer, I want to filter marketplace results by distance, so that I only see items I can realistically pick up.*

**Acceptance Criteria:**
* **Given** a buyer sets the radius filter to 25 miles.
* **When** the feed reloads.
* **Then** every visible listing is within 25 miles of the buyer.
* **Given** a buyer sets a radius in which zero listings exist.
* **When** the feed reloads.
* **Then** the system displays an empty state reading "No listings with 25 miles. Try widening your search".
* **Given** a buyer clears the radius filter.
* **When** the feed reloads.
* **Then** all listings render regardless of location.

# Buyer-Seller Connection

### Story 3.9: Link Listing to Seller's Rig Profile
*As a buyer, I want to see the seller's rig profile from their listing, so that I can judge whether the part fits a build like mine.*

**Acceptance Criteria:**
* **Given** a listing posted by a seller with a public rig profile.
* **When** the buyer taps the sellers' name.
* **Then** the seller's Rig Details page opens.
* **Given** a listing posted by a seller with a private rig profile.
* **When** the buyer taps the seller's name.
* **Then** the system displays a locked state reading "This rig profile is private".
* **Given** a seller has no rig profile.
* **When** a buyer views their listing.
* **Then** the seller's name renders as plain text with no tap action.

### Story 3.10: "Message Seller" Deep Link Into Chat
*As a buyer, I want a "Message Seller" button on a listing that opens the chat tab with a prefilled thread, so that I do not have to hunt for the seller.*

**Acceptance Criteria:**
* **Given** a buyer taps "Message Seller" on a listing with no prior thread with that seller.
* **When** the chat tab opens.
* **Then** a new thread is created with the seller and the listing title is prefilled in the message draft.
* **Given** a buyer taps "Message Seller" when a thread with that seller already exists.
* **When** the chat tab opens.
* **Then** the existing thread opens and no duplicate thread is created.
* **Given** a seller opens their own listing.
* **When** the page loads.
* **Then** the "Message Seller" button is not rendered.

# Safety Minimum

### Story 3.11: Report a Listing With Moderation Queue
*As a buyer, I want to flag an inappropriate or scammy listing, so that the marketplace stays trustworthy.*

**Acceptance Criteria:**
* **Given** a buyer opens the report dialog on a listing.
* **When** they select the reason "Scam" and submit.
* **Then** the system records the flag and displays confirmation reading "Thanks - we'll review this listing".
* **Given** a buyer has already flagged a specific listing.
* **When** they attempt to flag the same listing again.
* **Then** the system blocks the duplicate and displays "You've already reported this listing".
* **Given** a listing has received 3 flags.
* **When** the third flag is recorded.
* **Then** the backend automatically hides the listing from the feed pending review.
* **Given** a moderator opens the moderation queue.
* **When** the queue loads
* **Then** flagged listings render with their flag reasons, counts, and reporter notes.

### Story 3.12 (💡 Proposed — pending team sign-off): AI Listing Draft Assistant
*As a seller, I want the app to draft my listing from a photo and a rough description, so that posting takes seconds — with my review and approval before anything goes live.*

**Draft design (not yet ticketed):** `POST /marketplace/listing-draft` returns a schema-validated draft (title, category, cleaned-up description); the seller reviews, edits, and confirms before the existing create-listing flow posts it. Price and contact details are always human-entered, never model-generated. If the model is unavailable or slow, the endpoint returns no draft and the seller uses the manual form — never an error or a hang. Patterns: structured extraction + drafting with human approval (per the course AI-integration guidelines).

# Epic 4: Marketplace Engagement and Trust

This document outlines the vertical-slice user stories for Epic 4 of the Jtap application, covering the retention and trust layer that ships after the core marketplace: saved searches, watchlists, alerts, seller verification, and pricing intelligence. All acceptance criteria strictly follow the Given/When/Then format to ensure requirements are testable and explicitly cover happy paths, error paths, empty states, and permission boundaries. Unquantified adjectives have been deliberately omitted.

**Status:** all Epic 4 stories 📋 Planned — no board tickets yet.

# Retention 

### Story 4.1: Saved Searches With Push Notifications
*As a buyer, I want to save a search and get a push notification when a matching listing is posted, so that I do not miss deals.*

**Acceptance Criteria:**
* **Given** a buyer saves a search for "35-inch tires" in the "Wheels & Tires" category.
* **When** a new listing matching those keywords and that category is posted.
* **Then** the buyer receives a push notification within 5 minutes.
* **Given** a buyer deletes a saved search.
* **When** a matching listing is later posted.
* **Then** no notification is sent.
* **Given** a buyer has push notifications disabled at the OS level.
* **When** they attempt to save a search with alerts on.
* **Then** the system warns "Push notifications are disabled — enable them in Settings to receive alerts" and still saves the search.

### Story 4.2: Watchlist / Favorite Listings
*As a buyer, I want to heart listings into a watchlist, so that I can come back to them later.*

**Acceptance Criteria:**
* **Given** a buyer taps the heart icon on a listing.
* **When** they open their watchlist.
* **Then** the listing appears in the watchlist.
* **Given** a watched listing is marked as sold by the seller.
* **When** the buyer opens their watchlist.
* **Then** the listing remains visible with a "Sold" overlay.
* **Given** a buyer removes a listing from the watchlist.
* **When** they reopen the watchlist.
* **Then** the listing no longer appears.

### Story 4.3: Price-Drop Alerts on Favorited Listings
*As a buyer, I want a notification when the price drops on a listing I have favorited, so that I can jump on the deal.*

**Acceptance Criteria:**
* **Given** a buyer favorited a listing priced at $300.
* **When** the seller edits the price to $250.
* **Then** the buyer receives a notification reading "Price drop: $300 → $250".
* **Given** a buyer favorited a listing priced at $300.
* **When** the seller edits the price to $350.
* **Then** no notification is sent.
* **Given** a buyer unfavorited a listing before a price drop.
* **When** the seller lowers the price.
* **Then** no notification is sent to that buyer.

# Trust Signals

### Story 4.4: Verified Seller Badge
*As a buyer, I want to see a verified badge on trustworthy sellers, so that I can buy with confidence.*

**Acceptance Criteria:**
* **Given** a seller whose account is older than 90 days with at least one marked-sold listing.
* **When** a buyer views their listing.
* **Then** a verified badge renders next to the seller's name.
* **Given** a seller whose account is 10 days old with zero sold listings.
* **When** a buyer views their listing.
* **Then** no verified badge renders.
* **Given** a seller who previously qualified drops below the criteria (e.g., account flagged).
* **When** a buyer views their listing.
* **Then** the badge is no longer displayed.

# Pricing Intelligence

### Story 4.5: Sold Price History Per Category
*As a seller, I want to see what similar items actually sold for in each category, so that I can price my listing fairly.*

**Acceptance Criteria:**
* **Given** the "Wheels & Tires" category has 20 sold listings in the last 90 days.
* **When** a seller opens the price history for that category.
* **Then** the system displays the median and range of sold prices.
* **Given** a category has 3 sold listing in the last 90 days.
* **When** a seller opens the price history for that category.
* **Then** the system displays "Not enough data yet" instead of statistics.
* **Given** price history is displayed.
* **When** the data loads.
* **Then** no individual seller or listing is identifiable in the aggregates.

---

## Update log

- **2026-10-20:** Added Epic 0 (shipped platform) and per-story statuses throughout. Epic 1 gained its story→ticket mapping; the Epic 2 mapping (previously sitting under Epic 1's header) moved under Epic 2. Epic 1 AC stack references corrected (MongoDB → SQLite, Django → FastAPI). Stories 1.1–1.8 marked 🔨 implemented on branches pending PR (verified end-to-end 2026-10-20); Story 2.7 marked 🔄 in review. Proposed Story 3.12 (AI listing draft assistant) added.
