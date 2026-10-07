"""Simple profanity filter for user-facing postings (marketplace, meetups).

Matches whole words only (so "Scunthorpe" and "classic" are safe), after
normalizing common leet-speak and masking obfuscation like f**k / sh*t.
"""

import re

# Base vulgar words, matched as whole words after normalization.
_WORDS = {
    # The classics
    "fuck", "fucker", "fuckers", "fucking", "fucked", "motherfucker",
    "motherfuckers", "motherfucking", "fuckboy", "fuckface", "clusterfuck",
    "shit", "shits", "shitty", "shitting", "bullshit", "shitbox", "shithead",
    "shitshow", "shitlord",
    "bitch", "bitches", "bitchy", "bitching",
    "ass", "asses", "asshole", "assholes", "jackass", "dumbass", "smartass",
    "asshat", "assclown",
    "bastard", "bastards",
    "dick", "dicks", "dickhead", "dickheads",
    "cock", "cocks", "cocksucker",
    "cunt", "cunts",
    "pussy", "pussies",
    "whore", "whores",
    "slut", "sluts", "slutty",
    "tit", "tits", "titty", "titties",
    "boob", "boobs", "booby",
    "prick", "pricks",
    "douche", "douchebag", "douchebags",
    "wanker", "wankers",
    "twat", "twats",
    "bollocks",
    "bugger", "buggers",
    "crap", "crappy",
    "piss", "pissed", "pissing",
    "damn", "damned", "goddamn", "goddamned",
    "arse", "arses", "arsehole",
    "tittie",
    # Slurs have no place in public postings either
    "retard", "retards", "retarded",
    "faggot", "faggots", "fag", "fags", "dyke", "dykes",
    "nigger", "niggers", "nigga", "niggas",
    "chink", "chinks", "spic", "spics", "kike", "kikes",
    "gook", "gooks", "wetback", "towelhead",
}

# Masked forms like f**k, f*ck, sh*t, b*tch, F.U.C.K — each letter may be
# replaced by a mask char or separated by junk, but the match must still sit
# on word boundaries so "classic" and "Scunthorpe" stay safe.
_LEET_CLASS = {
    "a": "a4@",
    "b": "b",
    "c": "c",
    "d": "d",
    "e": "e3",
    "f": "f",
    "g": "g",
    "h": "h",
    "i": "i1!",
    "j": "j",
    "k": "k",
    "l": "l1",
    "m": "m",
    "n": "n",
    "o": "o0",
    "p": "p",
    "q": "q",
    "r": "r",
    "s": "s5$",
    "t": "t7+",
    "u": "u",
    "v": "v",
    "w": "w",
    "x": "x",
    "y": "y",
    "z": "z",
}
_MASK_CHARS = "*#_×x"


def _masked_pattern(word: str) -> "re.Pattern":
    parts = []
    for ch in word:
        cls = _LEET_CLASS.get(ch, ch) + _MASK_CHARS
        parts.append(f"(?:[{re.escape(cls)}])")
    return re.compile(r"(?<![a-z])" + r"[\W_]*".join(parts) + r"(?![a-z])",
                      re.IGNORECASE)


_MASKED = [_masked_pattern(w) for w in sorted(_WORDS, key=len)]

_LEET = str.maketrans({
    "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t",
    "@": "a", "$": "s", "!": "i", "+": "t",
})


def _normalize(text: str) -> str:
    return text.lower().translate(_LEET)


def find_profanity(text: str) -> str | None:
    """Return the offending word if `text` contains profanity, else None."""
    if not text:
        return None
    for pat in _MASKED:
        if pat.search(text):
            return "masked profanity"
    for word in re.findall(r"[a-z]+", _normalize(text)):
        if word in _WORDS:
            return word
    return None


def assert_clean(*texts: str) -> None:
    """Raise ValueError naming the offending word if any text is profane."""
    for text in texts:
        hit = find_profanity(text or "")
        if hit:
            raise ValueError(f"profanity detected: {hit}")
