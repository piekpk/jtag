"""Unit tests for backend/profanity.py — the profanity filter for user postings.

Test design (CSC 325 Module 6):
- Oracles come from the module docstring (the specification), not from what
  the code currently returns. If the code is wrong, these tests must fail.
- Equivalence classes: clean text, direct profanity, leet-speak, masked
  forms, substring lookalikes ("Scunthorpe"), empty input.
- Boundary analysis: word edges — punctuation adjacent, start/end of string,
  case variations, substrings that must NOT match.
- One behaviour per test (no Assertion Roulette); names state the expected
  behaviour; Arrange-Act-Assert throughout.
"""

import pytest

from profanity import assert_clean, find_profanity


# ---------------------------------------------------------------------------
# find_profanity: clean text -> None
# ---------------------------------------------------------------------------

def test_clean_sentence_returns_none():
    # Arrange
    text = "Looking to trade my blue duck for a red one"
    # Act
    result = find_profanity(text)
    # Assert
    assert result is None


def test_empty_string_returns_none():
    assert find_profanity("") is None


def test_none_input_returns_none():
    assert find_profanity(None) is None


# ---------------------------------------------------------------------------
# find_profanity: whole-word matching ("Scunthorpe problem")
# Spec: "Matches whole words only (so 'Scunthorpe' and 'classic' are safe)"
# ---------------------------------------------------------------------------

def test_scunthorpe_is_safe():
    # "Scunthorpe" contains "cunt" as a substring but is not profane.
    assert find_profanity("Scunthorpe") is None


def test_classic_is_safe():
    # "classic" contains "ass" as a substring but is not profane.
    assert find_profanity("I found a classic duck") is None


def test_assistant_is_safe():
    assert find_profanity("ask my assistant") is None


def test_profanity_at_start_of_string_is_found():
    assert find_profanity("shit happens") == "shit"


def test_profanity_at_end_of_string_is_found():
    assert find_profanity("what the shit") == "shit"


def test_profanity_next_to_punctuation_is_found():
    # Punctuation must not shield a whole word.
    assert find_profanity("well, shit?") == "shit"


def test_profanity_case_insensitive():
    assert find_profanity("SHIT") == "shit"


# ---------------------------------------------------------------------------
# find_profanity: leet-speak normalization
# Spec: "after normalizing common leet-speak" (1->i, 3->e, 4->a, 5->s, ...)
# ---------------------------------------------------------------------------

def test_leet_speak_1_for_i_is_detected():
    assert find_profanity("sh1t") == "shit"


def test_leet_speak_4_for_a_is_detected():
    assert find_profanity("d4mn") == "damn"


def test_leet_speak_at_sign_for_a_is_detected():
    assert find_profanity("d@mn") == "damn"


# ---------------------------------------------------------------------------
# find_profanity: masked obfuscation
# Spec: "masking obfuscation like f**k / sh*t"
# ---------------------------------------------------------------------------

def test_masked_f_star_star_k_is_detected():
    assert find_profanity("f**k") == "masked profanity"


def test_masked_sh_star_t_is_detected():
    assert find_profanity("sh*t") == "masked profanity"


# ---------------------------------------------------------------------------
# assert_clean: raises ValueError naming the word, else silent
# ---------------------------------------------------------------------------

def test_assert_clean_passes_on_clean_text():
    # Act / Assert — must not raise.
    assert_clean("trading ducks this weekend", "meetup at the park")


def test_assert_clean_raises_naming_the_word():
    # Arrange / Act / Assert
    with pytest.raises(ValueError, match="shit"):
        assert_clean("what the shit")


def test_assert_clean_checks_every_argument():
    # The second of several texts is profane — must still raise.
    with pytest.raises(ValueError):
        assert_clean("clean text", "oh shit", "also clean")


def test_assert_clean_tolerates_empty_strings():
    assert_clean("", "fine")
