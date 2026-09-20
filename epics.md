# Epic 1: Rig Profiles & Build Comparisons (The "Garage")

This document outlines the vertical-slice user stories for Epic 1 of the TrailGrid application. All acceptance criteria strictly follow the Given/When/Then format to ensure requirements are testable and explicitly cover happy paths, error paths, empty states, and permission boundaries  . Unquantified adjectives have been deliberately omitted.

## Core Vehicle Identity

### Story 1.1: Create Base Profile
*As a new app user, I want to create a base vehicle profile by inputting my rig's Year, Make, and Model, so that I have a foundation to document my specific off-road build.*

**Acceptance Criteria:**
* **Given** an authenticated user navigates to the "My Garage" tab with no existing vehicle profiles saved.
* **When** the screen loads.
* **Then** the system displays a default empty state reading "No rigs found. Add your first vehicle to get started".
* **Given** the user fills out the "Year," "Make," and "Model" text fields and clicks "Save."
* **When** the server processes the submission.
* **Then** the base profile is stored in the MongoDB database, and the user is redirected to their newly created Rig Details page.
* **Given** the user is attempting to save a new base profile.
* **When** the user leaves the "Make" or "Model" fields completely blank and clicks "Save."
* **Then** the system prevents the form submission and surfaces an inline error message reading "Make and Model are required fields."

### Story 1.2: Upload Rig Photo
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
*As a rig owner, I want to update a saved modification, so that I can correct typos or update brand names.*  

**Acceptance Criteria:**
* **Given** a user clicks the "Edit" icon next to a saved modification.
* **When** they change the text from "33-inch tires" to "35-inch tires" and click "Save."
* **Then** the database updates the specific array item, and the updated text renders on the profile.
* **Given** a user is actively editing a modification.
* **When** they delete all text from the input field so it is completely empty and attempt to save.
* **Then** the system disables the save button and requires at least 1 character to be present to submit.

### Story 1.6: Remove Modification
*As a rig owner, I want to delete a specific modification from my list, so that my build accurately reflects parts I have uninstalled.*  

**Acceptance Criteria:**
* **Given** a user clicks the "Delete" icon next to a specific modification in their list.
* **When** the action is triggered.
* **Then** the backend removes that specific item from the MongoDB array, and the nested item immediately disappears from the user interface.
* **Given** a user deletes the final modification listed under a specific category header (e.g., "Armor").
* **When** the item is removed.
* **Then** the system automatically hides the empty "Armor" category header from the profile view  .

## Social Visibility

### Story 1.7: View Peer Build Sheet
*As a trail driver, I want to view the modification list of another public user, so that I can research their setup.*  

**Acceptance Criteria:**
* **Given** a user clicks on another driver's rig icon from the map view.
* **When** the profile data is requested.
* **Then** the Django API retrieves and renders the target user's Rig Details page within 2 seconds on a standard 4G connection.
* **Given** the user successfully loads a peer's profile.
* **When** the target user has zero modifications saved to their account.
* **Then** the modifications section displays an empty state reading "This user has not listed any modifications yet".

### Story 1.8: Privacy Toggle
*As a driver, I want to toggle my garage profile to private, so that strangers cannot view my modification inventory.*  

**Acceptance Criteria:**
* **Given** the user navigates to their profile settings.
* **When** they switch the visibility toggle from "Public" to "Private."
* **Then** the database updates the profile's visibility state to private.
* **Given** a user attempts to view a peer's rig profile from the radar map.
* **When** the target user has configured their account privacy settings to "Private."
* **Then** the system displays a locked state reading "This rig profile is private" and strictly prevents any modification array data from being loaded or displayed.
