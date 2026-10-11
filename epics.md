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

# Epic 2: Squads (Groups / Clans)

This document outlines the vertical-slice user stories for Epic 2 of the TrailGrid application: named, joinable groups for the off-road community. All acceptance criteria strictly follow the Given/When/Then format to ensure requirements are testable and explicitly cover happy paths, error paths, empty states, and permission boundaries. Unquantified adjectives have been deliberately omitted.

## Formation & Membership

### Story 2.1: Create Squad
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
*As a squad leader, I want to manage roles and remove members, so that I can moderate my squad.*

**Acceptance Criteria:**
* **Given** the squad leader views the squad profile.
* **When** the profile loads.
* **Then** Edit, Remove member, Transfer leadership, and Delete squad controls are visible.
* **Given** a user who is not the squad leader views the squad profile.
* **When** the profile loads.
* **Then** the leader-only controls are completely hidden from the DOM, not merely disabled.
* **Given** the squad leader transfers leadership to another member.
* **When** the transfer is confirmed.
* **Then** the target member becomes leader and the previous leader becomes a regular member.
* **Given** the squad leader deletes the squad and confirms.
* **When** the deletion is processed.
* **Then** the squad, its memberships, and its pending invites are permanently removed.

## Engagement

### Story 2.6: Squad Activity Feed
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
