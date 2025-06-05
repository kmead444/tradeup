// Line 1: Toggle between login and signup forms
function toggleAuth(showLogin) {
  document.getElementById('signupForm').classList.toggle('hidden', showLogin);
  document.getElementById('loginForm').classList.toggle('hidden', !showLogin);
}
// Line 6: Handle user signup
async function submitSignup() {
  const name = document.getElementById('signupName')?.value;
  const email = document.getElementById('signupEmail')?.value;
  const password = document.getElementById('signupPassword')?.value;

  if (!name || !email || !password) {
    alert("Please fill out all fields.");
    return;
  }

  try {
    const res = await fetch('/api/auth/signup', { // Corrected endpoint for clarity
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();
    alert(data.message);

    if (res.ok) {
      localStorage.setItem('currentUser', JSON.stringify(data.user));
      window.location.href = 'dashboard.html'; // REDIRECT AFTER SIGNUP
    }
  } catch (error) {
    console.error("Signup error:", error);
    alert("Signup failed.");
  }
}

// Line 31: Handle user login
async function submitLogin() {
  const email = document.getElementById('loginEmail')?.value;
  const password = document.getElementById('loginPassword')?.value;

  if (!email || !password) {
    alert("Please enter your email and password.");
    return;
  }

  try {
    const res = await fetch('/api/auth/login', { // Corrected endpoint for clarity
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    alert(data.message);

    if (res.ok) {
      localStorage.setItem('currentUser', JSON.stringify(data.user));
      window.location.href = 'dashboard.html'; // REDIRECT AFTER LOGIN
    }
  } catch (error) {
    console.error("Login error:", error);
    alert("Login failed.");
  }
}

// Helper function to escape HTML for security (prevents XSS)
function escapeHtml(text) {
  const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Function to format timestamp for display
function formatTimestamp(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString();
}

document.addEventListener('DOMContentLoaded', () => {
    let user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) {
        return window.location.href = '/';
    }

    let socketReady = false;

    function initWebSocket() {
        socket = new WebSocket(`ws://${window.location.host}`);
        socket.addEventListener('open', () => {
            socketReady = true;
            socket.send(JSON.stringify({ type: 'auth', userId: user.id }));
        });
        socket.addEventListener('close', () => { socketReady = false; });
        socket.addEventListener('message', handleSocketMessage);
    }

    function handleSocketMessage(event) {
        let msg;
        try { msg = JSON.parse(event.data); } catch (err) { return; }
        if (msg.type === 'new_message') {
            if (activeConversationId && msg.conversationId === activeConversationId) {
                fetchAndRenderMessages(activeConversationId);
                markConversationAsRead(activeConversationId);
            } else {
                fetchAndRenderConversations();
                fetchAndRenderNotifications();
            }
        } else if (msg.type === 'new_dealroom_message') {
            if (activeDealroomData && msg.dealroomId === activeDealroomData.dealroom.id) {
                openDealroomChat(msg.dealroomId);
            } else {
                fetchAndRenderDealrooms();
                fetchAndRenderNotifications();
            }
        }
    }

    function sendViaSocket(data) {
        if (socketReady) {
            socket.send(JSON.stringify(data));
            return true;
        }
        return false;
    }

    // References to main view containers
    const dashboardView = document.getElementById('dashboardView');
    const contactsView = document.getElementById('contactsView');
    const messagesView = document.getElementById('messagesView');
    const dealroomsView = document.getElementById('dealroomsView'); // NEW: Reference to dealrooms view
    // References to navigation tabs
    const dashboardTab = document.getElementById('dashboardTab');
    const contactsTab = document.getElementById('contactsTab');
    const dealroomsTab = document.getElementById('dealroomsTab');
    const messageTab = document.getElementById('messageTab');
    const viewAllContactsButton = document.getElementById('viewAllContactsButton');

    // References to dashboard elements
    const profileImage = document.getElementById('profileImage');
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const profileBioDisplay = document.getElementById('profileBioDisplay');
    const toggleProfileEditFormButton = document.getElementById('toggleProfileEditForm');
    const profileEditFormContainer = document.getElementById('profileEditFormContainer');
    const profileBioInput = document.getElementById('profileBioInput');
    const profilePictureInput = document.getElementById('profilePictureInput');
    const profileForm = document.getElementById('profileForm');
    const postForm = document.getElementById('postForm');
    const postContentInput = document.getElementById('postContent');
    const postSubmitButton = document.getElementById('postSubmitButton');
    const postList = document.getElementById('postList');
    const feedContainer = document.getElementById('feedContainer');
    const contactsPreviewList = document.getElementById('contactsPreviewList');

    // References to Contacts View elements
    const contactsSearchInput = document.getElementById('contactsSearchInput');
    const contactsSearchButton = document.getElementById('contactsSearchButton');
    const userSearchResults = document.getElementById('userSearchResults');
    const contactsManagementList = document.getElementById('contactsManagementList');
    const editContactsManagementButton = document.getElementById('editContactsManagementButton');
    const doneEditingContactsManagementButton = document.getElementById('doneEditingContactsManagementButton');
    const showAllContactsButton = document.getElementById('showAllContactsButton');
    const showContactRequestsButton = document.getElementById('showContactRequestsButton');
    const contactsListSection = document.getElementById('contactsListSection');
    const contactRequestsSection = document.getElementById('contactRequestsSection');
    const incomingRequestsList = document.getElementById('incomingRequestsList');
    const outgoingRequestsList = document.getElementById('outgoingRequestsList');
    const editContactsControls = document.getElementById('editContactsControls');

    // References to Deal Rooms View elements (NEW/MODIFIED)
    const dealroomList = document.getElementById('dealroomList');
    const createDealroomForm = document.getElementById('createDealroomForm');
    const dealroomPartnerSelect = document.getElementById('dealroomPartnerSelect');
    const incomingDealroomInvitesList = document.getElementById('incomingDealroomInvitesList');
    const outgoingDealroomInvitesList = document.getElementById('outgoingDealroomInvitesList');
    // Active Dealroom Details Section
    const activeDealroomDetails = document.getElementById('activeDealroomDetails');
    const activeDealroomTitle = document.getElementById('activeDealroomTitle');
    const dealProgressBar = document.getElementById('dealProgressBar');
    const stage0Label = document.getElementById('stage0Label');
    const stage1Label = document.getElementById('stage1Label');
    const stage2Label = document.getElementById('stage2Label');
    const stage3Label = document.getElementById('stage3Label');
    const currentStageDetails = document.getElementById('currentStageDetails');
    const dealroomChatArea = document.getElementById('dealroomChatArea');
    const dealroomMessageForm = document.getElementById('dealroomMessageForm');
    const dealroomMessageInput = document.getElementById('dealroomMessageInput');
    const dealroomDocumentsList = document.getElementById('dealroomDocumentsList');
    const dealroomDocumentUploadForm = document.getElementById('dealroomDocumentUploadForm');
    const dealroomDocumentInput = document.getElementById('dealroomDocumentInput');
    const userReadyCheckbox = document.getElementById('userReadyCheckbox');
    const userReadyLabel = document.getElementById('userReadyLabel');
    const stageReadinessSection = document.getElementById('stageReadinessSection');
    const contractWalletSection = document.getElementById('contractWalletSection');
    const buyerContractControls = document.getElementById('buyerContractControls');
    const contractBuilderInput = document.getElementById('contractBuilderInput');
    const buildContractButton = document.getElementById('buildContractButton');
    const sellerContractReview = document.getElementById('sellerContractReview');
    const displayedContractDetails = document.getElementById('displayedContractDetails');
    const agreeContractButton = document.getElementById('agreeContractButton');
    const fundingExecutionSection = document.getElementById('fundingExecutionSection');
    const buyerFundingControls = document.getElementById('buyerFundingControls');
    const loadMoneyButton = document.getElementById('loadMoneyButton');
    const finalGreenLightSection = document.getElementById('finalGreenLightSection');
    const finalGreenLightCheckbox = document.getElementById('finalGreenLightCheckbox');


    // NEW: Notification Elements
    const notificationBell = document.getElementById('notificationBell');
    const notificationBadge = document.getElementById('notificationBadge');
    const notificationsDropdown = document.getElementById('notificationsDropdown');
    const notificationsList = document.getElementById('notificationsList');

    // NEW: Message Elements
    const conversationList = document.getElementById('conversationList');
    const messageThreadContainer = document.getElementById('messageThreadContainer');
    const threadPartnerProfilePic = document.getElementById('threadPartnerProfilePic');
    const messagePartnerName = document.getElementById('messagePartnerName');
    const messageList = document.getElementById('messageList');
    const sendMessageForm = document.getElementById('sendMessageForm');
    const messageInput = document.getElementById('messageInput');


    let editingPostId = null;
    let isEditingContactsManagement = false;
    let activeConversationId = null; // NEW: To track the currently open conversation
    let currentPartner = null; // NEW: To store information about the partner in the active conversation
    let activeDealroomData = null; // NEW: To store the currently active dealroom data

    const socket = new WebSocket(location.origin.replace(/^http/, 'ws'));
    socket.addEventListener('open', () => {
        socket.send(JSON.stringify({ type: 'auth', userId: user.id }));
    });
    socket.addEventListener('message', (event) => {
        let evt;
        try { evt = JSON.parse(event.data); } catch { return; }
        if (evt.type === 'new_message') {
            if (activeConversationId && evt.conversationId === activeConversationId) {
                fetchAndRenderMessages(activeConversationId);
            } else {
                fetchAndRenderConversations();
                fetchAndRenderNotifications();
            }
        }
    });


    // --- View Switching Logic ---
    function showScreen(screenId) {
        localStorage.setItem('lastView', screenId);
        // Hide all screens
        dashboardView.classList.add('hidden');
        contactsView.classList.add('hidden');
        messagesView.classList.add('hidden');
        dealroomsView.classList.add('hidden'); // Ensure this is also hidden by default
        // Remove active class from all tabs
        dashboardTab.classList.remove('active');
        contactsTab.classList.remove('active');
        dealroomsTab.classList.remove('active');
        messageTab.classList.remove('active');
        // Show the selected screen and activate its tab
        if (screenId === 'dashboardView') {
            dashboardView.classList.remove('hidden');
            dashboardTab.classList.add('active');
            fetchAndRenderPosts();
            fetchAndRenderContactsPreview();
        } else if (screenId === 'contactsView') {
            contactsView.classList.remove('hidden');
            contactsTab.classList.add('active');
            // Default to showing all contacts when contacts view is opened
            showContactsListSection();
            fetchAndRenderContactsManagement();
        } else if (screenId === 'dealroomsView') {
            dealroomsView.classList.remove('hidden');
            dealroomsTab.classList.add('active');
            fetchAndRenderDealrooms();
            populateDealroomPartnerSelect(); // NEW: Populate contacts dropdown for dealrooms
            fetchAndRenderIncomingDealroomInvites(); // NEW: Fetch and render dealroom invites
            fetchAndRenderOutgoingDealroomInvites(); // NEW: Fetch and render dealroom invites
            activeDealroomDetails.style.display = 'none'; // Hide dealroom chat initially
        } else if (screenId === 'messagesView') {
            messagesView.classList.remove('hidden');
            messageTab.classList.add('active');
            fetchAndRenderConversations(); // NEW: Fetch and render conversations
            messageThreadContainer.classList.add('hidden'); // Hide thread initially
        }
         // Always fetch notifications when screen changes
        fetchAndRenderNotifications();
    }

    // Initial load: restore last viewed screen if available
    function restoreLastState() {
        const lastView = localStorage.getItem('lastView');
        if (lastView) {
            showScreen(lastView);
            if (lastView === 'messagesView') {
                const savedConvoId = localStorage.getItem('activeConversationId');
                if (savedConvoId) {
                    fetch(`/api/messages/conversations/${user.id}`)
                        .then(res => res.json())
                        .then(convos => {
                            const convo = convos.find(c => c.id === parseInt(savedConvoId));
                            if (convo) {
                                const partner = convo.user1.id === user.id ? convo.user2 : convo.user1;
                                openChatThread(parseInt(savedConvoId), partner);
                            }
                        })
                        .catch(err => console.error('Error restoring conversation:', err));
                }
            } else if (lastView === 'dealroomsView') {
                const savedDealroomId = localStorage.getItem('activeDealroomId');
                if (savedDealroomId) {
                    openDealroomChat(parseInt(savedDealroomId));
                }
            }
        } else {
            showScreen('dashboardView');
        }
    }
    restoreLastState();

    // Nav Tab Event Listeners
    dashboardTab.addEventListener('click', () => showScreen('dashboardView'));
    contactsTab.addEventListener('click', () => showScreen('contactsView'));
    dealroomsTab.addEventListener('click', () => showScreen('dealroomsView'));
    messageTab.addEventListener('click', () => showScreen('messagesView'));
    viewAllContactsButton.addEventListener('click', () => showScreen('contactsView'));

    // --- Contact View Sub-section Switching ---
    function showContactsListSection() {
        contactsListSection.classList.remove('hidden');
        contactRequestsSection.classList.add('hidden');
        showAllContactsButton.classList.add('active');
        showContactRequestsButton.classList.remove('active');
        // Ensure edit controls are visible if not in requests section
        editContactsControls.classList.remove('hidden');
        // Refresh contacts management list when switching to this view
        fetchAndRenderContactsManagement();
    }

    function showContactRequestsSection() {
        contactsListSection.classList.add('hidden');
        contactRequestsSection.classList.remove('hidden');
        showAllContactsButton.classList.remove('active');
        showContactRequestsButton.classList.add('active');
        // Hide edit controls when in requests section
        editContactsControls.classList.add('hidden');
        // Fetch and render requests when this section is shown
        fetchAndRenderIncomingRequests();
        fetchAndRenderOutgoingRequests();
    }

    showAllContactsButton.addEventListener('click', showContactsListSection);
    showContactRequestsButton.addEventListener('click', showContactRequestsSection);

    // Helper function to escape HTML for security (prevents XSS)
    function escapeHtml(text) {
      const map = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;'
      };
      return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    // Function to format timestamp for display
    function formatTimestamp(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        return date.toLocaleString();
    }

    // --- Profile Management ---
    function displayProfile() {
        const defaultProfilePic = 'https://via.placeholder.com/80/7d1e3f/FFFFFF?text=TP';
        profileImage.src = user.profilePictureUrl ? user.profilePictureUrl : defaultProfilePic;
        
        profileName.innerText = "Name: " + user.name;
        profileEmail.innerText = "Email: " + user.email;
        profileBioDisplay.innerText = "Bio: " + (user.bio || 'Not set yet.');

        profileBioInput.value = user.bio || '';
    }
    displayProfile();

    toggleProfileEditFormButton.addEventListener('click', () => {
        profileEditFormContainer.classList.toggle('hidden');
    });

    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const bio = profileBioInput.value.trim();
        const profilePictureFile = profilePictureInput.files[0];

        const formData = new FormData();
        formData.append('bio', bio);
        if (profilePictureFile) {
            formData.append('profilePicture', profilePictureFile);
        }

        try {
            const response = await fetch(`/api/users/profile/${user.id}`, { // Corrected endpoint for profile update
                method: 'PUT',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to update profile.');
            }

            const responseData = await response.json();
            user = responseData.user;
            localStorage.setItem('currentUser', JSON.stringify(user));
            
            displayProfile();
            profilePictureInput.value = '';
            alert('Profile updated successfully!');
            profileEditFormContainer.classList.add('hidden');
        } catch (error) {
            console.error('Error updating profile:', error);
            alert(`Error: ${error.message}`);
        }
    });

    // --- Contacts Management (on Contacts View) ---

    // Event listener for the "Edit" and "Done" buttons on Contacts Management screen
    if (editContactsManagementButton) {
        editContactsManagementButton.addEventListener('click', () => {
            isEditingContactsManagement = true;
            editContactsManagementButton.classList.add('hidden');
            doneEditingContactsManagementButton.classList.remove('hidden');
            // Show remove buttons
            const removeButtons = contactsManagementList.querySelectorAll('.remove-contact-button');
            removeButtons.forEach(button => button.classList.remove('hidden'));
        });
    }

    if (doneEditingContactsManagementButton) {
        doneEditingContactsManagementButton.addEventListener('click', () => {
            isEditingContactsManagement = false;
            editContactsManagementButton.classList.remove('hidden');
            doneEditingContactsManagementButton.classList.add('hidden');
            // Hide remove buttons
            const removeButtons = contactsManagementList.querySelectorAll('.remove-contact-button');
            removeButtons.forEach(button => button.classList.add('hidden'));
        });
    }

    // Handle User Search Form Submission (on Contacts View)
    contactsSearchButton.addEventListener('click', async (e) => {
        e.preventDefault();
        const query = contactsSearchInput.value.trim();
        if (query.length < 2) {
            userSearchResults.innerHTML = '<p style="text-align: center; color: #888;">Please enter at least 2 characters to search.</p>';
            return;
        }

        try {
            const response = await fetch(`/api/users/search?query=${encodeURIComponent(query)}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to search users.');
            }
            const usersFound = await response.json();
            renderSearchResults(usersFound);
        } catch (error) {
            console.error('Error searching users:', error);
            userSearchResults.innerHTML = `<p style="color: red; text-align: center;">Error searching users: ${error.message}</p>`;
        }
    });

    // Render User Search Results (on Contacts View)
    async function renderSearchResults(usersFound) {
        userSearchResults.innerHTML = '';
        const defaultProfilePic = 'https://via.placeholder.com/40/0000FF/FFFFFF?text=U';

        if (usersFound.length === 0) {
            userSearchResults.innerHTML = '<p style="text-align: center; color: #888;">No users found.</p>';
            return;
        }

        const currentContacts = await fetchContactsData();
        const currentContactIds = new Set(currentContacts.map(contact => contact.id));
        
        const incomingRequests = await fetchIncomingRequestsData();
        const outgoingRequests = await fetchOutgoingRequestsData();
        const incomingRequestSenderIds = new Set(incomingRequests.map(req => req.senderId));
        const outgoingRequestReceiverIds = new Set(outgoingRequests.map(req => req.receiverId));


        let resultsCount = 0;
        usersFound.forEach(foundUser => {
            if (foundUser.id === user.id) {
                return; // Don't show current user in search results
            }

            resultsCount++;
            const userItem = document.createElement('div');
            userItem.className = 'contact-item-full';

            let buttonHtml = '';
            if (currentContactIds.has(foundUser.id)) {
                buttonHtml = `<button class="add-contact-button" disabled style="background-color: #555; cursor: not-allowed;">Already Contacts</button>`;
            } else if (outgoingRequestReceiverIds.has(foundUser.id)) {
                buttonHtml = `<button class="add-contact-button" disabled style="background-color: #555; cursor: not-allowed;">Request Sent</button>`;
            } else if (incomingRequestSenderIds.has(foundUser.id)) {
                buttonHtml = `<button class="add-contact-button" disabled style="background-color: #555; cursor: not-allowed;">Incoming Request</button>`;
            }
            else {
                buttonHtml = `<button class="add-contact-button" data-contact-id="${foundUser.id}">Send Request</button>`;
            }

            userItem.innerHTML = `
                <img src="${foundUser.profilePictureUrl || defaultProfilePic}" alt="Profile Picture">
                <div class="contact-info-full">
                    <strong>${escapeHtml(foundUser.name)}</strong>
                    <span>${escapeHtml(foundUser.email)}</span>
                </div>
                ${buttonHtml}
            `;
            
            const sendRequestButton = userItem.querySelector('.add-contact-button:not([disabled])');
            if (sendRequestButton) {
                sendRequestButton.addEventListener('click', () => sendContactRequest(foundUser.id));
            }
            userSearchResults.appendChild(userItem);
        });

        if (resultsCount === 0) {
             userSearchResults.innerHTML = '<p style="text-align: center; color: #888;">No other users found.</p>';
        }
    }

    // NEW: Send Contact Request Function
    async function sendContactRequest(receiverId) {
        try {
            const response = await fetch('/api/contacts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    senderId: user.id,
                    receiverId: receiverId
                })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Failed to send request.');
            }

            alert(data.message);
            contactsSearchInput.value = '';
            userSearchResults.innerHTML = '';
            await fetchAndRenderOutgoingRequests();
            await fetchAndRenderIncomingRequests();
            fetchAndRenderNotifications(); // Refresh notifications
        } catch (error) {
            console.error('Error sending contact request:', error);
            alert(`Error sending request: ${error.message}`);
        }
    }

    // MODIFIED: Remove Contact Function (now removes mutual relationship)
    async function removeContact(contactIdToRemove) {
        if (!confirm('Are you sure you want to remove this contact? This will remove them from both your and their contact lists.')) {
            return;
        }
        try {
            const response = await fetch(`/api/contacts/${contactIdToRemove}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId: user.id })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to remove contact.');
            }

            alert('Contact removed successfully!');
            await fetchAndRenderContactsManagement();
            await fetchAndRenderContactsPreview();
        } catch (error) {
            console.error('Error removing contact:', error);
            alert(`Error removing contact: ${error.message}`);
        }
    }

    // Fetch Contacts Data (helper for rendering both preview and full list)
    async function fetchContactsData() {
        try {
            const response = await fetch(`/api/contacts/${user.id}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch contacts.');
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching contacts data:', error);
            return [];
        }
    }

    // Render Contacts for the Dashboard Preview
    async function fetchAndRenderContactsPreview() {
        const contacts = await fetchContactsData();
        contactsPreviewList.innerHTML = '';
        const defaultProfilePic = 'https://via.placeholder.com/30/0000FF/FFFFFF?text=C';

        if (contacts.length === 0) {
            contactsPreviewList.innerHTML = '<p style="text-align: center; color: #888;">You have no contacts yet.</p>';
            return;
        }

        const previewCount = 5;
        contacts.slice(0, previewCount).forEach(contact => {
            const contactItem = document.createElement('div');
            contactItem.className = 'contacts-preview-item';
            contactItem.innerHTML = `
                <img src="${contact.profilePictureUrl || defaultProfilePic}" alt="Contact Picture">
                <span>${escapeHtml(contact.name)}</span>
            `;
            contactsPreviewList.appendChild(contactItem);
        });

        if (contacts.length > previewCount) {
          const moreLink = document.createElement('p');
          moreLink.style.textAlign = 'center';
          moreLink.style.marginTop = '0.5rem';
          moreLink.style.fontSize = '0.8em';
          moreLink.innerHTML = `<a href="#" id="viewMoreContactsLink" style="color: gold; text-decoration: underline;">+ ${contacts.length - previewCount} more</a>`;
          contactsPreviewList.appendChild(moreLink);
          moreLink.querySelector('#viewMoreContactsLink').addEventListener('click', (e) => {
              e.preventDefault();
              showScreen('contactsView');
          });
        }
    }

    // Render Contacts for the dedicated Contacts Management Screen
    async function fetchAndRenderContactsManagement() {
        const contacts = await fetchContactsData();
        contactsManagementList.innerHTML = '';
        const defaultProfilePic = 'https://via.placeholder.com/40/0000FF/FFFFFF?text=C';

        if (contacts.length === 0) {
            contactsManagementList.innerHTML = '<p style="text-align: center; color: #888;">You have no contacts yet.</p>';
            return;
        }

        contacts.forEach(contact => {
            const contactItem = document.createElement('div');
            contactItem.className = 'contact-item-full';
            contactItem.innerHTML = `
                <img src="${contact.profilePictureUrl || defaultProfilePic}" alt="Contact Picture">
                <div class="contact-info-full">
                    <strong>${escapeHtml(contact.name)}</strong>
                    <span>${escapeHtml(contact.email)}</span>
                </div>
                <button class="remove-contact-button" data-contact-id="${contact.id}">Remove</button>
            `;
            
            const removeButton = contactItem.querySelector('.remove-contact-button');
            if (removeButton) {
                if (!isEditingContactsManagement) {
                    removeButton.classList.add('hidden');
                }
                removeButton.addEventListener('click', () => removeContact(contact.id));
            }
            contactsManagementList.appendChild(contactItem);
        });
    }

    // NEW: Fetch and Render Incoming Contact Requests
    async function fetchIncomingRequestsData() {
        try {
            const response = await fetch(`/api/contacts/incoming/${user.id}`); 
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch incoming requests.');
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching incoming requests:', error);
            return [];
        }
    }

    async function fetchAndRenderIncomingRequests() {
        const requests = await fetchIncomingRequestsData();
        incomingRequestsList.innerHTML = '';
        const defaultProfilePic = 'https://via.placeholder.com/40/FF0000/FFFFFF?text=R';

        if (requests.length === 0) {
            incomingRequestsList.innerHTML = '<p style="text-align: center; color: #888;">No incoming requests.</p>';
            return;
        }

        requests.forEach(request => {
            const requestItem = document.createElement('div');
            requestItem.className = 'request-item';
            requestItem.innerHTML = `
                <img src="${request.senderProfilePictureUrl || defaultProfilePic}" alt="Sender Profile Picture">
                <div class="request-info">
                    <strong>${escapeHtml(request.senderName)}</strong>
                    <span>${escapeHtml(request.senderEmail)}</span>
                    <span style="font-size: 0.7em; color: #888; display: block;">Sent: ${formatTimestamp(request.createdAt)}</span>
                </div>
                <button class="request-action-button accept" data-request-id="${request.requestId}">Accept</button>
                <button class="request-action-button reject" data-request-id="${request.requestId}">Reject</button>
            `;
            
            requestItem.querySelector('.accept').addEventListener('click', () => acceptContactRequest(request.requestId));
            requestItem.querySelector('.reject').addEventListener('click', () => rejectContactRequest(request.requestId));
            incomingRequestsList.appendChild(requestItem);
        });
    }

    // NEW: Fetch and Render Outgoing Contact Requests
    async function fetchOutgoingRequestsData() {
        try {
            const response = await fetch(`/api/contacts/outgoing/${user.id}`); 
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch outgoing requests.');
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching outgoing requests:', error);
            return [];
        }
    }

    async function fetchAndRenderOutgoingRequests() {
        const requests = await fetchOutgoingRequestsData();
        outgoingRequestsList.innerHTML = '';
        const defaultProfilePic = 'https://via.placeholder.com/40/0000FF/FFFFFF?text=O';

        if (requests.length === 0) {
            outgoingRequestsList.innerHTML = '<p style="text-align: center; color: #888;">No outgoing requests.</p>';
            return;
        }

        requests.forEach(request => {
            const requestItem = document.createElement('div');
            requestItem.className = 'request-item';
            requestItem.innerHTML = `
                <img src="${request.receiverProfilePictureUrl || defaultProfilePic}" alt="Receiver Profile Picture">
                <div class="request-info">
                    <strong>${escapeHtml(request.receiverName)}</strong>
                    <span>${escapeHtml(request.receiverEmail)}</span>
                    <span style="font-size: 0.7em; color: #888; display: block;">Sent: ${formatTimestamp(request.createdAt)}</span>
                </div>
                <button class="add-contact-button" disabled style="background-color: #555; cursor: not-allowed;">Pending...</button>
            `;
            outgoingRequestsList.appendChild(requestItem);
        });
    }

    // NEW: Accept Contact Request
    async function acceptContactRequest(requestId) {
        if (!confirm('Are you sure you want to accept this contact request?')) {
            return;
        }
        try {
            const response = await fetch(`/api/contacts/${requestId}/accept`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId: user.id })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Failed to accept request.');
            }

            alert(data.message);
            await fetchAndRenderIncomingRequests();
            await fetchAndRenderContactsManagement();
            await fetchAndRenderContactsPreview();
            fetchAndRenderNotifications(); // Refresh notifications
        } catch (error) {
            console.error('Error accepting contact request:', error);
            alert(`Error accepting request: ${error.message}`);
        }
    }

    // NEW: Reject Contact Request
    async function rejectContactRequest(requestId) {
        if (!confirm('Are you sure you want to reject this contact request?')) {
            return;
        }
        try {
            const response = await fetch(`/api/contacts/${requestId}/reject`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId: user.id })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Failed to reject request.');
            }

            alert(data.message);
            await fetchAndRenderIncomingRequests();
            fetchAndRenderNotifications(); // Refresh notifications
        } catch (error) {
            console.error('Error rejecting contact request:', error);
            alert(`Error rejecting request: ${error.message}`);
        }
    }


    // --- Post Management (Dashboard Feed) ---
    async function renderComments(postId, commentListElement) {
        try {
            const response = await fetch(`/api/posts/${postId}/comments`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const comments = await response.json();

            commentListElement.innerHTML = '';
            if (comments.length === 0) {
                commentListElement.innerHTML = '<p style="text-align: center; color: #888; font-size:0.8em;">No comments yet.</p>';
            } else {
                comments.forEach(comment => {
                    const commentDiv = document.createElement('div');
                    commentDiv.className = 'comment-card';
                    commentDiv.innerHTML = `
                        <strong>${escapeHtml(comment.author)}</strong>
                        <span class="timestamp">${formatTimestamp(comment.timestamp)}</span>
                        <p>${escapeHtml(comment.content)}</p>
                    `;
                    commentListElement.appendChild(commentDiv);
                });
            }
        } catch (error) {
            console.error(`Error fetching comments for post ${postId}:`, error);
            commentListElement.innerHTML = `<p style="color: red; text-align: center; font-size:0.8em;">Failed to load comments.</p>`;
        }
    }

    async function fetchAndRenderPosts() {
        try {
            const response = await fetch('/api/posts');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const posts = await response.json();

            postList.innerHTML = '';
            if (posts.length === 0) {
                postList.innerHTML = '<p style="text-align: center; color: #888;">No posts yet. Be the first to post!</p>';
            } else {
                for (const post of posts) {
                    const div = document.createElement('div');
                    div.className = 'postCard';
                    
                    let actionButtons = '';
                    if (post.authorId === user.id) {
                        actionButtons = `
                          <div class="post-actions">
                              <button onclick="editPost('${post.id}', '${escapeHtml(post.content)}')" class="edit-button">Edit</button>
                              <button onclick="deletePost('${post.id}')" class="delete-button">Delete</button>
                          </div>
                        `;
                    }

                    div.innerHTML = `
                        <strong>${escapeHtml(post.author)}</strong>
                        <span class="timestamp">${formatTimestamp(post.timestamp)}</span>
                        ${actionButtons}
                        <p>${escapeHtml(post.content)}</p>
                        <div class="comment-section">
                            <p style="font-size:0.9em; color:#bbb; margin-bottom: 0.5rem;">Comments (${post.commentCount})</p>
                            <div class="comment-list" id="comments-for-post-${post.id}">
                                </div>
                            <form class="comment-form" data-post-id="${post.id}">
                                <input type="text" class="comment-input" placeholder="Add a comment..." required>
                                <button type="submit" class="submitButton">Comment</button>
                            </form>
                        </div>
                    `;
                    postList.appendChild(div);

                    const commentListElement = document.getElementById(`comments-for-post-${post.id}`);
                    await renderComments(post.id, commentListElement);
                }
                document.querySelectorAll('.comment-form').forEach(form => {
                    form.addEventListener('submit', handleCommentSubmit);
                });
            }
        } catch (error) {
            console.error('Error fetching posts:', error);
            postList.innerHTML = `<p style="color: red; text-align: center;">Failed to load posts. ${error.message}</p>`;
        }
    }

    async function handleCommentSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const postId = form.dataset.postId;
        const commentInput = form.querySelector('.comment-input');
        const content = commentInput.value.trim();

        if (content === '') return;

        try {
            const response = await fetch(`/api/posts/${postId}/comments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: content,
                    author: user.name,
                    authorId: user.id
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to add comment.');
            }

            commentInput.value = '';
            const commentListElement = document.getElementById(`comments-for-post-${postId}`);
            await renderComments(postId, commentListElement);
            await fetchAndRenderPosts();
            fetchAndRenderNotifications(); // Refresh notifications
        } catch (error) {
            console.error('Error submitting comment:', error);
            alert(`Error: ${error.message}`);
        }
    }

    postForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = postContentInput.value.trim();
      if (content === '') return;

      try {
          let response;
          if (editingPostId) {
              response = await fetch(`/api/posts/${editingPostId}`, {
                  method: 'PUT',
                  headers: {
                      'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                      content: content,
                      userId: user.id
                  }),
              });
          } else {
              response = await fetch('/api/posts', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                      content: content,
                      author: user.name,
                      authorId: user.id
                  }),
              });
          }

          if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.message || 'Operation failed.');
          }

          postContentInput.value = '';
          postSubmitButton.textContent = 'Post';
          editingPostId = null;
          await fetchAndRenderPosts();
          feedContainer.scrollTop = 0;
      } catch (error) {
          console.error('Error submitting/updating post:', error);
          alert(`Error: ${error.message}`);
      }
    });

    window.editPost = function(postId, currentContent) {
        postContentInput.value = currentContent;
        postSubmitButton.textContent = 'Update Post';
        editingPostId = postId;
        postContentInput.focus();
        feedContainer.scrollTop = 0;
    };

    window.deletePost = async function(postId) {
        if (!confirm('Are you sure you want to delete this post?')) {
            return;
        }

        try {
            const response = await fetch(`/api/posts/${postId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: user.id
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to delete post.');
            }

            alert('Post deleted successfully!');
            await fetchAndRenderPosts();
        } catch (error) {
            console.error('Error deleting post:', error);
            alert(`Error: ${error.message}`);
        }
    };

    window.deleteDealroom = async function(dealroomId) {
        if (!confirm('Are you sure you want to delete this dealroom?')) {
            return;
        }

        try {
            const response = await fetch(`/api/dealrooms/${dealroomId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: user.id
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to delete dealroom.');
            }

            alert('Dealroom deleted successfully!');

            if (activeDealroomData && activeDealroomData.dealroom.id === parseInt(dealroomId)) {
                activeDealroomDetails.style.display = 'none';
                activeDealroomData = null;
                localStorage.removeItem('activeDealroomId');
            }

            await fetchAndRenderDealrooms();
        } catch (error) {
            console.error('Error deleting dealroom:', error);
            alert(`Error: ${error.message}`);
        }
    };

    feedContainer.addEventListener('scroll', () => {
      if (feedContainer.scrollTop + feedContainer.clientHeight >= feedContainer.scrollHeight - 5) {
        console.log("Reached bottom of feed (or near it)");
      }
    });

    // --- Deal Room Management ---
    async function fetchAndRenderDealrooms() {
        try {
            const response = await fetch(`/api/dealrooms/user/${user.id}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch dealrooms.');
            }
            const dealrooms = await response.json();

            dealroomList.innerHTML = '';
            if (dealrooms.length === 0) {
                dealroomList.innerHTML = '<p style="text-align: center; color: #888;">You have no active deal rooms yet. Create one!</p>';
                return;
            } else {
                dealrooms.forEach(dealroom => { // Removed slice(0, 5) to show all
                    const dealroomCard = document.createElement('div');
                    dealroomCard.className = 'dealroom-card';
                    dealroomCard.dataset.dealroomId = dealroom.dealroomId; // Use dealroomId
                    dealroomCard.innerHTML = `
                        <div class="dealroom-actions"><button class="delete-button" onclick="event.stopPropagation(); deleteDealroom('${dealroom.dealroomId}')">Delete</button></div>
                        <p>Deal Title: <span class="dealroom-emails">${escapeHtml(dealroom.title)}</span></p>
                        <p style="font-size: 0.8em; color: #bbb;">Buyer: ${escapeHtml(dealroom.buyerName)} (${escapeHtml(dealroom.buyerEmail)})</p>
                        <p style="font-size: 0.8em; color: #bbb;">Seller: ${escapeHtml(dealroom.sellerName)} (${escapeHtml(dealroom.sellerEmail)})</p>
                        <p style="font-size: 0.8em; color: #bbb;">Current Stage: <strong>${escapeHtml(dealroom.stage.replace('_', ' ').toUpperCase())}</strong></p>
                    `;
                    dealroomCard.addEventListener('click', () => {
                        openDealroomChat(dealroom.dealroomId);
                    });
                    dealroomList.appendChild(dealroomCard);
                });
            }
        } catch (error) {
            console.error('Error fetching deal rooms:', error);
            dealroomList.innerHTML = `<p style="color: red; text-align: center;">Failed to load deal rooms: ${error.message}</p>`;
        }
    }

    // NEW: Function to open a specific dealroom's chat and details
    async function openDealroomChat(dealroomId) {
        localStorage.setItem('activeDealroomId', dealroomId);
        localStorage.removeItem('activeConversationId');
        try {
            const response = await fetch(`/api/dealrooms/${dealroomId}/details/${user.id}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch dealroom details.');
            }
            const dealroomData = await response.json();
            activeDealroomData = dealroomData; // Store active dealroom data

            // Show the active dealroom details section and hide the list
            activeDealroomDetails.style.display = 'flex'; // Use flex to maintain column layout
            // dealroomList.classList.add('hidden'); // Potentially hide dealroom list, or manage view states

            activeDealroomTitle.textContent = dealroomData.dealroom.title;

            renderDealStageTracker(dealroomData.dealroom.stage);
            renderCurrentStageDetails(dealroomData.dealroom);
            renderDealroomMessages(dealroomData.messages);
            renderDealroomDocuments(dealroomData.documents, dealroomData.dealroom);

            // Setup event listener for dealroom message form
            dealroomMessageForm.onsubmit = async (e) => {
                e.preventDefault();
                const content = dealroomMessageInput.value.trim();
                if (content === '') return;

                const payload = {
                    type: 'new_dealroom_message',
                    dealroomId: dealroomData.dealroom.id,
                    senderId: user.id,
                    content
                };

                if (sendViaSocket(payload)) {
                    dealroomMessageInput.value = '';
                    return;
                }

                try {
                    const msgResponse = await fetch('/api/messages', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            dealroomId: dealroomData.dealroom.id,
                            senderId: user.id,
                            content: content
                        }),
                    });

                    if (!msgResponse.ok) {
                        const errorData = await msgResponse.json();
                        throw new Error(errorData.message || 'Failed to send message.');
                    }

                    dealroomMessageInput.value = '';
                    // Re-fetch dealroom details to get updated messages
                    openDealroomChat(dealroomData.dealroom.id);
                } catch (error) {
                    console.error('Error sending dealroom message:', error);
                    alert(`Error: ${error.message}`);
                }
            };

             // Setup event listener for dealroom document upload form
             dealroomDocumentUploadForm.onsubmit = async (e) => {
                e.preventDefault();
                const file = dealroomDocumentInput.files[0];
                if (!file) {
                    alert('Please select a file to upload.');
                    return;
                }

                const formData = new FormData();
                formData.append('dealroomDocument', file);
                formData.append('uploaderId', user.id);

                try {
                    const docResponse = await fetch(`/api/dealrooms/${dealroomId}/documents/upload`, {
                        method: 'POST',
                        body: formData,
                    });

                    const docData = await docResponse.json();
                    if (!docResponse.ok) {
                        throw new Error(docData.message || 'Failed to upload document.');
                    }

                    alert(docData.message);
                    dealroomDocumentInput.value = ''; // Clear file input
                    openDealroomChat(dealroomId); // Refresh dealroom details and docs
                } catch (error) {
                    console.error('Error uploading document:', error);
                    alert(`Error: ${error.message}`);
                }
            };

            // Setup event listener for user readiness checkbox
            userReadyCheckbox.onclick = async () => {
                const isChecked = userReadyCheckbox.checked;
                try {
                    const response = await fetch(`/api/dealrooms/${dealroomId}/stage/advance`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: user.id, action: 'ready' })
                    });
                    const data = await response.json();
                    if (!response.ok) {
                        throw new Error(data.message || 'Failed to update readiness.');
                    }
                    alert(data.message);
                    openDealroomChat(dealroomId); // Refresh dealroom state
                } catch (error) {
                    console.error('Error updating readiness:', error);
                    alert(`Error: ${error.message}`);
                    userReadyCheckbox.checked = !isChecked; // Revert checkbox state on error
                }
            };

            // Setup event listener for build contract button (Buyer - Stage 2)
            buildContractButton.onclick = async () => {
                let contractDetails;
                try {
                    contractDetails = JSON.parse(contractBuilderInput.value.trim());
                } catch (e) {
                    alert('Invalid JSON in contract details. Please enter valid JSON.');
                    return;
                }
                
                if (!contractDetails || Object.keys(contractDetails).length === 0) {
                    alert('Please enter contract details.');
                    return;
                }

                try {
                    const response = await fetch(`/api/dealrooms/${dealroomId}/stage/advance`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: user.id, action: 'build_contract', contractData: contractDetails })
                    });
                    const data = await response.json();
                    if (!response.ok) {
                        throw new Error(data.message || 'Failed to build contract.');
                    }
                    alert(data.message);
                    openDealroomChat(dealroomId); // Refresh dealroom state
                } catch (error) {
                    console.error('Error building contract:', error);
                    alert(`Error: ${error.message}`);
                }
            };

            // Setup event listener for agree contract button (Seller - Stage 2)
            agreeContractButton.onclick = async () => {
                if (!confirm('Are you sure you want to agree to these contract conditions?')) return;
                try {
                    const response = await fetch(`/api/dealrooms/${dealroomId}/stage/advance`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: user.id, action: 'agree_contract' })
                    });
                    const data = await response.json();
                    if (!response.ok) {
                        throw new Error(data.message || 'Failed to agree to contract.');
                    }
                    alert(data.message);
                    openDealroomChat(dealroomId); // Refresh dealroom state
                } catch (error) {
                    console.error('Error agreeing to contract:', error);
                    alert(`Error: ${error.message}`);
                }
            };

            // Setup event listener for load money button (Buyer - Stage 3)
            loadMoneyButton.onclick = async () => {
                if (!confirm('Simulate loading money to wallet?')) return;
                try {
                    const response = await fetch(`/api/dealrooms/${dealroomId}/stage/advance`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: user.id, action: 'load_money' })
                    });
                    const data = await response.json();
                    if (!response.ok) {
                        throw new Error(data.message || 'Failed to load money.');
                    }
                    alert(data.message);
                    openDealroomChat(dealroomId); // Refresh dealroom state
                } catch (error) {
                    console.error('Error loading money:', error);
                    alert(`Error: ${error.message}`);
                }
            };

            // Setup event listener for final green light checkbox
            finalGreenLightCheckbox.onclick = async () => {
                const isChecked = finalGreenLightCheckbox.checked;
                try {
                    const response = await fetch(`/api/dealrooms/${dealroomId}/stage/advance`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: user.id, action: 'final_green_light' })
                    });
                    const data = await response.json();
                    if (!response.ok) {
                        throw new Error(data.message || 'Failed to give final green light.');
                    }
                    alert(data.message);
                    openDealroomChat(dealroomId); // Refresh dealroom state
                } catch (error) {
                    console.error('Error giving final green light:', error);
                    alert(`Error: ${error.message}`);
                    finalGreenLightCheckbox.checked = !isChecked; // Revert checkbox state on error
                }
            };

        } catch (error) {
            console.error('Error opening dealroom chat:', error);
            alert(`Error: ${error.message}`);
            activeDealroomDetails.style.display = 'none'; // Hide if error occurs
        }
    }

    // NEW: Render Deal Stage Tracker
    function renderDealStageTracker(currentStage) {
        const stages = ['stage_0', 'stage_1', 'stage_2', 'stage_3', 'closed'];
        const stageLabels = {
            'stage_0': 'Docs Upload',
            'stage_1': 'Negotiation',
            'stage_2': 'Contract Build',
            'stage_3': 'Funding/Execution',
            'closed': 'Closed'
        };
        const stageColors = {
            'stage_0': 'linear-gradient(90deg, #FFD700, #FFC107)', // Gold to Amber
            'stage_1': 'linear-gradient(90deg, #FFC107, #FFA500)', // Amber to Orange
            'stage_2': 'linear-gradient(90deg, #FFA500, #FF8C00)', // Orange to Dark Orange
            'stage_3': 'linear-gradient(90deg, #FF8C00, #4CAF50)', // Dark Orange to Green
            'closed': '#888' // Gray for closed
        };

        const activeStageIndex = stages.indexOf(currentStage);
        const progress = (activeStageIndex / (stages.length - 1)) * 100;
        
        dealProgressBar.style.width = `${progress}%`;
        // Dynamically change background color based on active stage
        dealProgressBar.style.background = stageColors[currentStage] || 'linear-gradient(90deg, #FFD700, #7d1e3f)'; 

        // Update stage labels
        [stage0Label, stage1Label, stage2Label, stage3Label].forEach((labelElement, index) => {
            const stageKey = stages[index];
            labelElement.textContent = stageLabels[stageKey]; // Ensure labels are always correct
            if (index <= activeStageIndex) {
                labelElement.classList.add('active-stage');
            } else {
                labelElement.classList.remove('active-stage');
            }
        });
    }

    // NEW: Render Current Stage Details (Dynamic content)
    function renderCurrentStageDetails(dealroom) {
        currentStageDetails.innerHTML = ''; // Clear previous content
        dealroomDocumentUploadForm.classList.add('hidden');
        stageReadinessSection.classList.add('hidden');
        userReadyCheckbox.checked = false; // Reset checkbox
        contractWalletSection.classList.add('hidden');
        buyerContractControls.classList.add('hidden');
        sellerContractReview.classList.add('hidden');
        fundingExecutionSection.classList.add('hidden');
        buyerFundingControls.classList.add('hidden');
        finalGreenLightSection.classList.add('hidden');
        finalGreenLightCheckbox.checked = false; // Reset checkbox

        const isBuyer = dealroom.buyerId === user.id;
        const isSeller = dealroom.sellerId === user.id;

        let detailsHtml = ``;

        switch (dealroom.stage) {
            case 'stage_0':
                detailsHtml = `
                    <p class="text-white mb-2">Stage: <strong>Document Upload (Pre-Negotiation)</strong></p>
                    <p class="text-sm text-gray-400">Both parties must upload initial private documents for verification.</p>
                    <p class="text-sm text-gray-400">Your documents are visible only to you and the simulated external API.</p>
                    <p class="text-sm text-gray-400 mt-2">Current Status:</p>
                    <ul class="list-disc list-inside text-sm text-gray-400 ml-4">
                        <li>Buyer Ready: ${dealroom.buyerReady ? '<span style="color:green;">Yes</span>' : '<span style="color:orange;">No</span>'}</li>
                        <li>Seller Ready: ${dealroom.sellerReady ? '<span style="color:green;">Yes</span>' : '<span style="color:orange;">No</span>'}</li>
                    </ul>
                `;
                dealroomDocumentUploadForm.classList.remove('hidden'); // Allow document upload
                stageReadinessSection.classList.remove('hidden'); // Show readiness checkbox
                userReadyLabel.textContent = `I have uploaded my documents and am ready to proceed.`;
                userReadyCheckbox.checked = (isBuyer && dealroom.buyerReady) || (isSeller && dealroom.sellerReady);
                break;
            case 'stage_1':
                detailsHtml = `
                    <p class="text-white mb-2">Stage: <strong>Negotiation</strong></p>
                    <p class="text-sm text-gray-400">Use the chat to discuss terms. Exchange public documents if needed.</p>
                    <p class="text-sm text-gray-400 mt-2">Current Status:</p>
                    <ul class="list-disc list-inside text-sm text-gray-400 ml-4">
                        <li>Buyer Ready: ${dealroom.buyerReady ? '<span style="color:green;">Yes</span>' : '<span style="color:orange;">No</span>'}</li>
                        <li>Seller Ready: ${dealroom.sellerReady ? '<span style="color:green;">Yes</span>' : '<span style="color:orange;">No</span>'}</li>
                    </ul>
                `;
                dealroomDocumentUploadForm.classList.remove('hidden'); // Allow document upload
                stageReadinessSection.classList.remove('hidden'); // Show readiness checkbox
                userReadyLabel.textContent = `I agree to the negotiated terms and am ready to move to Stage 2.`;
                userReadyCheckbox.checked = (isBuyer && dealroom.buyerReady) || (isSeller && dealroom.sellerReady);
                break;
            case 'stage_2':
                detailsHtml = `
                    <p class="text-white mb-2">Stage: <strong>Contract Building & Wallet Setup</strong></p>
                    <p class="text-sm text-gray-400">Buyer builds the smart contract; Seller reviews and agrees.</p>
                `;
                contractWalletSection.classList.remove('hidden'); // Show contract/wallet section
                if (isBuyer) {
                    buyerContractControls.classList.remove('hidden');
                    try {
                        const existingContract = JSON.stringify(dealroom.contractDetails, null, 2);
                        contractBuilderInput.value = existingContract === '{}' ? '' : existingContract;
                    } catch (e) {
                        contractBuilderInput.value = '';
                    }
                } else if (isSeller) {
                    sellerContractReview.classList.remove('hidden');
                    try {
                        displayedContractDetails.textContent = JSON.stringify(dealroom.contractDetails, null, 2);
                    } catch (e) {
                        displayedContractDetails.textContent = 'No contract details available.';
                    }
                }
                break;
            case 'stage_3':
                detailsHtml = `
                    <p class="text-white mb-2">Stage: <strong>Funding & Execution</strong></p>
                    <p class="text-sm text-gray-400">Buyer loads funds. Contract conditions must be met for closure.</p>
                `;
                fundingExecutionSection.classList.remove('hidden');
                if (isBuyer) {
                    buyerFundingControls.classList.remove('hidden');
                }
                finalGreenLightSection.classList.remove('hidden');
                userReadyLabel.textContent = `I give final green light to close the deal.`;
                finalGreenLightCheckbox.checked = (isBuyer && dealroom.buyerReady && dealroom.finalGreenLight) || (isSeller && dealroom.sellerReady && dealroom.finalGreenLight);
                break;
            case 'closed':
                detailsHtml = `
                    <p class="text-white mb-2">Stage: <strong>Deal Closed!</strong></p>
                    <p class="text-sm text-gray-400">This deal has been successfully completed and funds have been transferred.</p>
                `;
                break;
            default:
                detailsHtml = `<p class="text-white mb-2">Stage: <strong>${dealroom.stage}</strong></p>`;
                break;
        }
        currentStageDetails.innerHTML = detailsHtml;

         // Disable all interactive elements if deal is closed
         if (dealroom.stage === 'closed') {
            dealroomMessageInput.disabled = true;
            dealroomMessageForm.querySelector('button').disabled = true;
            dealroomDocumentUploadForm.classList.add('hidden'); // Ensure upload form is hidden
            userReadyCheckbox.disabled = true;
            buildContractButton.disabled = true;
            agreeContractButton.disabled = true;
            loadMoneyButton.disabled = true;
            finalGreenLightCheckbox.disabled = true;
         } else {
            dealroomMessageInput.disabled = false;
            dealroomMessageForm.querySelector('button').disabled = false;
            userReadyCheckbox.disabled = false;
            buildContractButton.disabled = false;
            agreeContractButton.disabled = false;
            loadMoneyButton.disabled = false;
            finalGreenLightCheckbox.disabled = false;
         }
    }

    // NEW: Render Dealroom Messages
    function renderDealroomMessages(messages) {
        dealroomChatArea.innerHTML = '';
        if (messages.length === 0) {
            dealroomChatArea.innerHTML = '<p style="text-align: center; color: #888;">No messages yet. Start the conversation!</p>';
            return;
        }
        messages.forEach(msg => {
            const messageBubble = document.createElement('div');
            messageBubble.className = `message-bubble ${msg.senderId === user.id ? 'sent' : 'received'}`;
            messageBubble.innerHTML = `
                <p><strong>${escapeHtml(msg.senderName || 'Unknown User')}:</strong> ${escapeHtml(msg.content)}</p>
                <span class="timestamp">${formatTimestamp(msg.timestamp)}</span>
            `;
            dealroomChatArea.appendChild(messageBubble);
        });
        dealroomChatArea.scrollTop = dealroomChatArea.scrollHeight; // Scroll to bottom
    }

    // NEW: Render Dealroom Documents
    function renderDealroomDocuments(documents, dealroom) {
        dealroomDocumentsList.innerHTML = '';
        if (documents.length === 0) {
            dealroomDocumentsList.innerHTML = '<p style="text-align: center; color: #888;">No documents uploaded yet.</p>';
            return;
        }
        documents.forEach(doc => {
            const docItem = document.createElement('div');
            docItem.className = 'document-item';
            let statusClass = '';
            let statusText = '';
            let flagLink = '';

            switch (doc.verificationStatus) {
                case 'pending':
                    statusClass = 'pending';
                    statusText = 'Pending';
                    break;
                case 'verified':
                    statusClass = 'verified';
                    statusText = 'Verified';
                    break;
                case 'flagged':
                    statusClass = 'flagged';
                    statusText = 'Flagged';
                    try {
                        const responseData = JSON.parse(doc.verificationResponse || '{}');
                        if (responseData.message) {
                            flagLink = `<a href="#" onclick="alert('Verification Details: ${escapeHtml(responseData.message)}'); return false;"><i class="fas fa-info-circle"></i> View Details</a>`;
                        }
                    } catch (e) {
                        console.error('Error parsing verification response for doc:', doc.id, e);
                    }
                    break;
                default:
                    statusClass = '';
                    statusText = 'Unknown';
                    break;
            }

            docItem.innerHTML = `
                <div class="doc-info">
                    <a href="${doc.filePath}" target="_blank" class="doc-name">${escapeHtml(doc.fileName)}</a>
                    <span class="doc-uploader">by ${escapeHtml(doc.uploaderName)} on ${formatTimestamp(doc.uploadedAt)}</span>
                </div>
                <span class="doc-status ${statusClass}">${statusText}${flagLink}</span>
            `;
            dealroomDocumentsList.appendChild(docItem);
        });
    }


    // NEW: Populate Dealroom Partner Select Dropdown
    async function populateDealroomPartnerSelect() {
        const contacts = await fetchContactsData(); // Reusing existing fetchContactsData
        dealroomPartnerSelect.innerHTML = '<option value="">Select Contact to Invite</option>';
        if (contacts.length === 0) {
            dealroomPartnerSelect.innerHTML += '<option value="" disabled>No contacts available</option>';
            return;
        }
        contacts.forEach(contact => {
            const option = document.createElement('option');
            option.value = contact.id; // Use contact's ID
            option.textContent = `${escapeHtml(contact.name)} (${escapeHtml(contact.email)})`;
            dealroomPartnerSelect.appendChild(option);
        });
    }

    // MODIFIED: Handle Create Dealroom Form Submission (now sends invite)
    createDealroomForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const invitedContactId = dealroomPartnerSelect.value; // Get selected contact ID

        if (!invitedContactId) {
            alert('Please select a contact to invite.');
            return;
        }
        
        if (parseInt(invitedContactId) === user.id) { // Ensure ID is parsed as int
          alert('You cannot invite yourself to a dealroom.');
          return;
        }

        try {
            const response = await fetch('/api/dealrooms', { // This endpoint now sends an invite
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    creatorId: user.id,
                    invitedContactId: parseInt(invitedContactId) // Send as integer
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Failed to send dealroom invite.');
            }

            alert(data.message);
            dealroomPartnerSelect.value = ''; // Reset dropdown
            await fetchAndRenderOutgoingDealroomInvites(); // Refresh outgoing invites
            fetchAndRenderNotifications(); // Refresh notifications
            fetchAndRenderDealrooms(); // Refresh dealroom list to show new pending dealroom
        } catch (error) {
            console.error('Error sending dealroom invite:', error);
            alert(`Error: ${error.message}`);
        }
    });

    // NEW: Fetch and Render Incoming Dealroom Invites
    async function fetchIncomingDealroomInvitesData() {
        try {
            const response = await fetch(`/api/dealrooms/invites/incoming/${user.id}`); 
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch incoming dealroom invites.');
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching incoming dealroom invites:', error);
            return [];
        }
    }

    async function fetchAndRenderIncomingDealroomInvites() {
        const invites = await fetchIncomingDealroomInvitesData();
        incomingDealroomInvitesList.innerHTML = '';
        const defaultProfilePic = 'https://via.placeholder.com/40/FFA500/FFFFFF?text=DI';

        if (invites.length === 0) {
            incomingDealroomInvitesList.innerHTML = '<p style="text-align: center; color: #888;">No incoming dealroom invites.</p>';
            return;
        }

        invites.forEach(invite => {
            const inviteItem = document.createElement('div');
            inviteItem.className = 'request-item'; // Reusing styling
            inviteItem.innerHTML = `
                <img src="${invite.senderProfilePictureUrl || defaultProfilePic}" alt="Sender Profile Picture">
                <div class="request-info">
                    <strong>${escapeHtml(invite.senderName)}</strong>
                    <span>${escapeHtml(invite.senderEmail)}</span>
                    <span style="font-size: 0.7em; color: #888; display: block;">Invited to: "${escapeHtml(invite.dealroomTitle)}"</span>
                    <span style="font-size: 0.7em; color: #888; display: block;">Sent: ${formatTimestamp(invite.createdAt)}</span>
                </div>
                <button class="dealroom-invite-action-button accept" data-invite-id="${invite.inviteId}">Accept</button>
                <button class="dealroom-invite-action-button reject" data-invite-id="${invite.inviteId}">Reject</button>
            `;
            
            inviteItem.querySelector('.accept').addEventListener('click', () => acceptDealroomInvite(invite.inviteId));
            inviteItem.querySelector('.reject').addEventListener('click', () => rejectDealroomInvite(invite.inviteId));
            incomingDealroomInvitesList.appendChild(inviteItem);
        });
    }

    // NEW: Fetch and Render Outgoing Dealroom Invites
    async function fetchOutgoingDealroomInvitesData() {
        try {
            const response = await fetch(`/api/dealrooms/invites/outgoing/${user.id}`); 
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch outgoing dealroom invites.');
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching outgoing dealroom invites:', error);
            return [];
        }
    }

    async function fetchAndRenderOutgoingDealroomInvites() {
        const invites = await fetchOutgoingDealroomInvitesData();
        outgoingDealroomInvitesList.innerHTML = '';
        const defaultProfilePic = 'https://via.placeholder.com/40/000080/FFFFFF?text=DO';

        if (invites.length === 0) {
            outgoingDealroomInvitesList.innerHTML = '<p style="text-align: center; color: #888;">No outgoing dealroom invites.</p>';
            return;
        }

        invites.forEach(invite => {
            const inviteItem = document.createElement('div');
            inviteItem.className = 'request-item'; // Reusing styling
            inviteItem.innerHTML = `
                <img src="${invite.receiverProfilePictureUrl || defaultProfilePic}" alt="Receiver Profile Picture">
                <div class="request-info">
                    <strong>${escapeHtml(invite.receiverName)}</strong>
                    <span>${escapeHtml(invite.receiverEmail)}</span>
                    <span style="font-size: 0.7em; color: #888; display: block;">Invited to: "${escapeHtml(invite.dealroomTitle)}"</span>
                    <span style="font-size: 0.7em; color: #888; display: block;">Sent: ${formatTimestamp(invite.createdAt)}</span>
                </div>
                <button class="add-contact-button" disabled style="background-color: #555; cursor: not-allowed;">Pending...</button>
            `;
            outgoingDealroomInvitesList.appendChild(inviteItem);
        });
    }

    // NEW: Accept Dealroom Invite
    async function acceptDealroomInvite(inviteId) {
        if (!confirm('Are you sure you want to accept this dealroom invite?')) {
            return;
        }
        try {
            const response = await fetch(`/api/dealrooms/invites/${inviteId}/accept`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId: user.id })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Failed to accept dealroom invite.');
            }

            alert(data.message);
            await fetchAndRenderIncomingDealroomInvites(); // Refresh incoming invites
            await fetchAndRenderDealrooms(); // Refresh active dealrooms list
            fetchAndRenderNotifications(); // Refresh notifications
        } catch (error) {
            console.error('Error accepting dealroom invite:', error);
            alert(`Error accepting invite: ${error.message}`);
        }
    }

    // NEW: Reject Dealroom Invite
    async function rejectDealroomInvite(inviteId) {
        if (!confirm('Are you sure you want to reject this dealroom invite?')) {
            return;
        }
        try {
            const response = await fetch(`/api/dealrooms/invites/${inviteId}/reject`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId: user.id })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Failed to reject dealroom invite.');
            }

            alert(data.message);
            await fetchAndRenderIncomingDealroomInvites(); // Refresh incoming invites
            fetchAndRenderNotifications(); // Refresh notifications
        } catch (error) {
            console.error('Error rejecting dealroom invite:', error);
            alert(`Error rejecting invite: ${error.message}`);
        }
    }

    // NEW: Notifications Logic
    notificationBell.addEventListener('click', async () => {
        notificationsDropdown.classList.toggle('active');
        if (notificationsDropdown.classList.contains('active')) {
            await fetchAndRenderNotifications(); // Ensure notifications are fresh when dropdown opens
            markAllNotificationsAsRead(); // Mark as read when dropdown is opened
        }
    });

    // Close dropdown if clicked outside
    document.addEventListener('click', (event) => {
        if (!notificationBell.contains(event.target) && !notificationsDropdown.contains(event.target)) {
            notificationsDropdown.classList.remove('active');
        }
    });

    async function fetchAndRenderNotifications() {
        try {
            const response = await fetch(`/api/notifications/unread/${user.id}`);
            if (!response.ok) {
                const errorData = await response.json();
                // Log the actual error message from the server if available
                console.error('Server error response:', errorData.message || 'No specific error message from server.');
                throw new Error(errorData.message || `Failed to fetch notifications. Status: ${response.status}`);
            }
            const notifications = await response.json();
            
            // Ensure notifications.details is an array
            if (!Array.isArray(notifications.details)) {
                console.error('Server response for notifications.details is not an array:', notifications.details);
                throw new Error('Invalid notification data received from server: details is not an array.');
            }

            updateNotificationBadge(notifications.totalUnreadCount);
            renderNotificationsList(notifications.details);

        } catch (error) {
            console.error('Error fetching notifications (frontend):', error);
            updateNotificationBadge(0);
            notificationsList.innerHTML = '<li style="text-align: center; color: red;">Failed to load notifications.</li>';
        }
    }

    function updateNotificationBadge(count) {
        if (count > 0) {
            notificationBadge.textContent = count;
            notificationBadge.style.display = 'block';
        } else {
            notificationBadge.style.display = 'none';
        }
    }

    function renderNotificationsList(notificationDetails) {
        notificationsList.innerHTML = ''; // Clear previous notifications
        if (notificationDetails.length === 0) {
            notificationsList.innerHTML = '<li style="text-align: center; color: #888;">No new notifications.</li>';
            return;
        }

        notificationDetails.forEach(notif => {
            const listItem = document.createElement('li');
            listItem.className = 'notification-item';
            let content = '';
            let navigateTo = ''; // To determine where to navigate when clicking a notification

            switch (notif.type) {
                case 'contact_request':
                    content = `<strong>${escapeHtml(notif.senderName || 'Unknown User')}</strong> sent you a contact request.`;
                    navigateTo = 'contactsView';
                    break;
                case 'contact_accepted':
                    content = `<strong>${escapeHtml(notif.senderName || 'Unknown User')}</strong> accepted your contact request.`;
                    navigateTo = 'contactsView';
                    break;
                case 'dealroom_invite':
                    content = `<strong>${escapeHtml(notif.senderName || 'Unknown User')}</strong> invited you to a deal room: "${escapeHtml(notif.dealroomTitle || 'N/A')}".`;
                    navigateTo = 'dealroomsView';
                    break;
                case 'dealroom_accepted':
                    content = `<strong>${escapeHtml(notif.senderName || 'Unknown User')}</strong> accepted your invite to dealroom: "${escapeHtml(notif.dealroomTitle || 'N/A')}".`;
                    navigateTo = 'dealroomsView';
                    break;
                case 'comment_on_post':
                    const displayPostContent = notif.postContent ? escapeHtml(notif.postContent) : 'your post';
                    content = `<strong>${escapeHtml(notif.commentAuthor || 'Unknown User')}</strong> commented on ${displayPostContent}.`;
                    navigateTo = 'dashboardView'; // Or link directly to the post/comment if feasible
                    break;
                case 'new_messages':
                  content = `You have <strong>${notif.unreadCount || 0}</strong> new message(s).`;
                  navigateTo = 'messagesView';
                  break;
                default:
                    // Use notif.message if available, otherwise a generic message.
                    content = `New notification: ${notif.message ? escapeHtml(notif.message) : 'An unknown notification occurred.'}`;
                    // No specific navigation for unknown types, can default or leave empty
                    break;
            }
            
            // Only append the list item if content was successfully generated
            if (content) {
                listItem.innerHTML = `${content}<span class="timestamp">${formatTimestamp(notif.timestamp)}</span>`;
                
                // Add click listener to navigate
                if (navigateTo) {
                    listItem.addEventListener('click', () => {
                        showScreen(navigateTo);
                        notificationsDropdown.classList.remove('active'); // Close dropdown
                    });
                }
                notificationsList.appendChild(listItem);
            }
        });
    }

    async function markAllNotificationsAsRead() {
        try {
            const response = await fetch(`/api/notifications/mark-read/${user.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                const errorData = await response.json();
                console.error('Server error marking notifications as read:', errorData.message || 'No specific error message from server.');
                throw new Error(errorData.message || `Failed to mark notifications as read. Status: ${response.status}`);
            }
            console.log('Notifications marked as read.');
            updateNotificationBadge(0); // Reset badge
        } catch (error) {
            console.error('Error marking notifications as read (frontend):', error);
        }
    }
    // NEW: Message Tab Functionality
    // let currentPartner = null; // To store information about the partner in the active conversation

    async function fetchAndRenderConversations() {
        try {
            const response = await fetch(`/api/messages/conversations/${user.id}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch conversations.');
            }
            const conversations = await response.json();

            conversationList.innerHTML = '';
            if (conversations.length === 0) {
                conversationList.innerHTML = '<p style="text-align: center; color: #888;">No conversations yet. Start one by searching for users!</p>';
                return;
            }

            conversations.sort((a, b) => new Date(b.lastMessageTimestamp || 0) - new Date(a.lastMessageTimestamp || 0));

            conversations.forEach(convo => {
                const partner = convo.user1.id === user.id ? convo.user2 : convo.user1;
                const defaultProfilePic = 'https://via.placeholder.com/50/0000FF/FFFFFF?text=U';
                const convoItem = document.createElement('div');
                convoItem.className = `conversation-item ${convo.unreadCount > 0 ? 'unread' : ''}`;
                convoItem.dataset.conversationId = convo.id;
                convoItem.dataset.partnerId = partner.id;
                convoItem.dataset.partnerName = partner.name;
                convoItem.dataset.partnerEmail = partner.email;
                convoItem.dataset.partnerProfilePic = partner.profilePictureUrl || defaultProfilePic;

                convoItem.innerHTML = `
                    <img src="${partner.profilePictureUrl || defaultProfilePic}" alt="Partner Profile Picture">
                    <div class="conversation-info">
                        <strong>${escapeHtml(partner.name)}</strong>
                        <span>${escapeHtml(convo.lastMessageContent || 'No messages yet.')}</span>
                        ${convo.lastMessageTimestamp ? `<span class="last-message-timestamp">${formatTimestamp(convo.lastMessageTimestamp)}</span>` : ''}
                    </div>
                `;
                convoItem.addEventListener('click', () => openChatThread(convo.id, partner));
                conversationList.appendChild(convoItem);
            });
        } catch (error) {
            console.error('Error fetching conversations:', error);
            conversationList.innerHTML = `<p style="color: red; text-align: center;">Failed to load conversations: ${error.message}</p>`;
        }
    }

    async function openChatThread(conversationId, partner) {
        activeConversationId = conversationId;
        currentPartner = partner; // Store partner info
        localStorage.setItem('activeConversationId', conversationId);
        localStorage.removeItem('activeDealroomId');

        messagePartnerName.textContent = `Chat with ${escapeHtml(partner.name)}`;
        threadPartnerProfilePic.src = partner.profilePictureUrl || 'https://via.placeholder.com/60/0000FF/FFFFFF?text=U';

        messageThreadContainer.classList.remove('hidden');
        await fetchAndRenderMessages(conversationId);
        await markConversationAsRead(conversationId);
        fetchAndRenderNotifications(); // Update notification badge
        fetchAndRenderConversations(); // Refresh conversation list to remove unread highlight
    }

    async function fetchAndRenderMessages(conversationId) {
        try {
            const response = await fetch(`/api/messages/thread/${conversationId}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch messages.');
            }
            const messages = await response.json();

            messageList.innerHTML = '';
            if (messages.length === 0) {
                messageList.innerHTML = '<p style="text-align: center; color: #888;">No messages yet. Send the first message!</p>';
                return;
            }

            messages.forEach(msg => {
                const messageBubble = document.createElement('div');
                messageBubble.className = `message-bubble ${msg.senderId === user.id ? 'sent' : 'received'}`;
                messageBubble.innerHTML = `
                    <p><strong>${escapeHtml(msg.senderName || 'Unknown User')}:</strong> ${escapeHtml(msg.content)}</p>
                    <span class="timestamp">${formatTimestamp(msg.timestamp)}</span>
                `;
                messageList.appendChild(messageBubble);
            });
            messageList.scrollTop = messageList.scrollHeight; // Scroll to bottom
        } catch (error) {
            console.error('Error fetching messages:', error);
            messageList.innerHTML = `<p style="color: red; text-align: center;">Failed to load messages: ${error.message}</p>`;
        }
    }

    sendMessageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = messageInput.value.trim();
        if (content === '' || !activeConversationId) return;

        const payload = {
            type: 'send_message',
            conversationId: activeConversationId,
            senderId: user.id,
            receiverId: currentPartner.id,
            content
        };

        if (sendViaSocket(payload)) {
            messageInput.value = '';
            return;
        }

        try {
            const response = await fetch('/api/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    conversationId: activeConversationId,
                    senderId: user.id,
                    receiverId: currentPartner.id,
                    content: content
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to send message.');
            }

            messageInput.value = '';
            await fetchAndRenderMessages(activeConversationId);
            fetchAndRenderConversations();
            fetchAndRenderNotifications();
        } catch (error) {
            console.error('Error sending message:', error);
            alert(`Error: ${error.message}`);
        }
    });

    async function markConversationAsRead(conversationId) {
        try {
            const response = await fetch(`/api/messages/read/${conversationId}/${user.id}`, {
                method: 'PUT',
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to mark conversation as read.');
            }
            console.log(`Conversation ${conversationId} marked as read for user ${user.id}`);
            // No need to alert, this should be seamless
        } catch (error) {
            console.error('Error marking conversation as read:', error);
        }
    }

    // Call initial functions for dashboard view
    fetchAndRenderContactsPreview();
    fetchAndRenderPosts();
    fetchAndRenderNotifications(); // Initial fetch of notifications
    initWebSocket();
});

function logout() {
  localStorage.removeItem('currentUser');
  localStorage.removeItem('lastView');
  localStorage.removeItem('activeConversationId');
  localStorage.removeItem('activeDealroomId');
  window.location.href = '/';
}
