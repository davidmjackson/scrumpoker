
 
 // --- DOM Elements --- ****
 const loginSection = document.getElementById('login-section');
 const roomDisplay = document.getElementById('room-display');
 const pokerRoomSection = document.getElementById('poker-room-section');
 const accessKeyInput = document.getElementById('access-key-input');
 const nameInput = document.getElementById('name-input');
 const roomInput = document.getElementById('room-input');
 const roleSelect = document.getElementById('role-select');
 const loginButton = document.getElementById('login-button');
 const loginError = document.getElementById('login-error');
 const userGreeting = document.getElementById('user-greeting');
 const votingCardsContainer = document.getElementById('voting-cards');
 const observerMessage = document.getElementById('observer-message');
 const voteError = document.getElementById('vote-error');
 const participantsListContainer = document.getElementById('participants-list');
 const facilitatorControls = document.getElementById('facilitator-controls');
 const showVotesButton = document.getElementById('show-votes-button');
 const startNextItemButton = document.getElementById('start-next-item-button');
 const resetVotesButton = document.getElementById('reset-votes-button');
 const voteSummary = document.getElementById('vote-summary');
 const averageVoteSpan = document.getElementById('average-vote');
 const resultItemName = document.getElementById('result-item-name');
 const roundStatus = document.getElementById('round-status');
 const currentItemDisplay = document.getElementById('current-item-display');
 const roundItemForm = document.getElementById('round-item-form');
 const roundItemInput = document.getElementById('round-item-input');
 const roundItemSaveButton = document.getElementById('round-item-save-button');
 const roundItemError = document.getElementById('round-item-error');
 const roundHistorySection = document.getElementById('round-history-section');
 const roundHistoryList = document.getElementById('round-history-list');
 const copyRoundHistoryButton = document.getElementById('copy-round-history-button');
 const adminRoomLink = document.getElementById('admin-room-link');
 const copyVoterInviteButton = document.getElementById('copy-voter-invite-button');
 const copyObserverInviteButton = document.getElementById('copy-observer-invite-button');
 const endSessionButton = document.getElementById('end-session-button');
 const logoutButton = document.getElementById('logout-button');

 const editRoleButton = document.getElementById('edit-role-button');
 const editRoleModal  = document.getElementById('edit-role-modal');
 const editRoleSelect = document.getElementById('edit-role-select');
 const editRoleError  = document.getElementById('edit-role-error');
 const saveRoleButton   = document.getElementById('save-role-button');
 const cancelEditRoleButton = document.getElementById('cancel-edit-role-button');
 const endSessionModal = document.getElementById('end-session-modal');
 const endSessionError = document.getElementById('end-session-error');
 const confirmEndSessionButton = document.getElementById('confirm-end-session-button');
 const cancelEndSessionButton = document.getElementById('cancel-end-session-button');

 const connectionStatus = document.getElementById('connection-status');

// Card dealer


 let animateVotingCards = true; // Controls whether cards animate in
 let voteErrorTimer = null;
 let resetFaceDownBeforeStateUpdate = false;
 const cardDeck = window.ScrumPokerCardDeck;
 const cardAnimator = cardDeck.createCardAnimator({
     getCards: () => votingCardsContainer.querySelectorAll('.vote-card .card-inner')
 });
 const ROOM_SESSION_STORAGE = 'scrumPokerRoomSession';
 const ROOM_RETURN_STORAGE = 'scrumPokerReturnToRoom';
 // --- Application State (Managed primarily by server now) ---
 let currentUser = null; // { id: string, name: string, role: 'Voter' | 'Facilitator' | 'Observer', vote: string | null }
 let currentRoom = null;   // ← NEW: will hold the room name after login
 let participants = []; // Array of user objects received from server
 let votesRevealed = false; // Status received from server
 let facilitatorId = null; // ID received from server
 let currentItem = '';
 let roundHistory = [];
 let pendingLoginContext = null;
 let shouldFocusNextItemInput = false;
 let allowStoredRoomRestore = true;
 let attemptedStoredRoomRestore = false;
 const fibonacciVotes = ['0', '1', '2', '3', '5', '8', '13', '?']; // Voting options


 // --- WebSocket Setup ---
 let ws = null;

// Dynamically determine WebSocket URL from the current page origin.

const loc = window.location;
const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
const WEBSOCKET_URL = `${protocol}//${loc.host}/ws`;


 function connectWebSocket() {
     console.log('Attempting to connect to WebSocket server...');
     updateConnectionStatus('connecting', 'Connecting...');
     loginButton.disabled = true;
     loginButton.textContent = 'Enter Room (Connecting...)';
     loginError.classList.add('hidden'); // Hide previous errors

     ws = new WebSocket(WEBSOCKET_URL);

     ws.onopen = () => {

         console.log('WebSocket connection established.');


         updateConnectionStatus('connected', 'Connected');

         loginButton.disabled = false;
         loginButton.textContent = 'Enter Room';

         showLogin(); // Show login screen for first time connection
         restoreStoredRoomSession();
     };

     ws.onmessage = (event) => {
         try {
             const message = JSON.parse(event.data);
             console.log('Message received from server:', message);
             handleServerMessage(message);
         } catch (error) {
             console.error('Failed to parse server message:', event.data, error);
         }
     };

     ws.onerror = (error) => {
         console.error('WebSocket error:', error);
         updateConnectionStatus('disconnected', 'Connection Error');
         loginButton.disabled = true;
         loginButton.textContent = 'Enter Room (Error)';
         showLogin({ clearError: false }); // Force back to login on connection error
         showLoginError('Cannot connect to the server. Please try again later.');
     };

     ws.onclose = (event) => {
         console.log('WebSocket connection closed:', event.reason, `Code: ${event.code}`);
         updateConnectionStatus('disconnected', 'Disconnected');
         loginButton.disabled = true;
         loginButton.textContent = 'Enter Room (Disconnected)';
         currentUser = null; // Clear user state
         participants = [];
         showLogin({ clearError: false }); // Go back to login screen
         showLoginError('Connection lost. Reconnecting...');
         // Optional: Attempt to reconnect after a delay
         setTimeout(connectWebSocket, 5000); // Reconnect after 5 seconds

     };
 }

 function updateConnectionStatus(status, text) {
     connectionStatus.className = status; // 'connected', 'disconnected', 'connecting'
     connectionStatus.textContent = text;
 }

function isLoginVisible() {
    return !loginSection.classList.contains('hidden');
}

function isRoomVisible() {
    return !pokerRoomSection.classList.contains('hidden');
}

function showLoginError(message) {
    loginError.textContent = message;
    loginError.classList.remove('hidden');
}

function hideLoginError() {
    loginError.classList.add('hidden');
}

function showVoteError(message) {
    voteError.textContent = message;
    voteError.classList.remove('hidden');

    if (voteErrorTimer) {
        clearTimeout(voteErrorTimer);
    }

    voteErrorTimer = setTimeout(() => {
        voteError.classList.add('hidden');
        voteErrorTimer = null;
    }, 3000);
}

 // --- Server Message Handler ---
 function handleServerMessage(message) {
     const { type, payload } = message;

     switch (type) {
         case 'yourId':
             // Store the ID assigned by the server
             if (payload && payload.id) {
                  // We don't set currentUser here yet, wait for login success / state update
                  sessionStorage.setItem('scrumPokerUserId_temp', payload.id); // Store temporarily until login
                  console.log('Received my user ID:', payload.id);
             }
             break;

         case 'updateState':
             if (payload) {
                 const wasVotesRevealed = votesRevealed;
                 const wasRoomVisible = isRoomVisible();
                 participants = payload.participants || [];
                 votesRevealed = payload.votesRevealed || false;
                 facilitatorId = payload.facilitatorId || null;
                 currentItem = payload.currentItem || '';
                 roundHistory = Array.isArray(payload.roundHistory) ? payload.roundHistory : [];

                 // Find the current user in the updated participant list
                const myTempId    = sessionStorage.getItem('scrumPokerUserId_temp');
                const mySessionId = sessionStorage.getItem('scrumPokerUserId');
                // Use stored session-id only if it still matches someone in the room; otherwise use temp:
                const myId = participants.some(p => p.id === mySessionId) ? mySessionId : myTempId;

                 if (myId) {
                    currentUser = participants.find(p => p.id === myId) || null;
                 } else {
                     currentUser = null; // Should not happen if connected/logged in
                 }


                 // If currentUser exists, we are in the room, otherwise stay/go to login
                 if (currentUser) {
                     // Update session storage with potentially changed details (like role)
                     sessionStorage.setItem('scrumPokerUserId', currentUser.id);
                     sessionStorage.setItem('scrumPokerUserName', currentUser.name);
                     persistRoomSession();
                     pendingLoginContext = null;

                    const isEnteringRoom = !pokerRoomSection || pokerRoomSection.classList.contains('hidden');
                    const didResetVotes = wasVotesRevealed &&
                        !votesRevealed &&
                        wasRoomVisible &&
                        !isEnteringRoom;
                    const shouldAnimateResetDeck = didResetVotes && !resetFaceDownBeforeStateUpdate;

                    if (isEnteringRoom) {
                        // Only entering the room for the first time!
                        animateVotingCards = true;
                    }



                     showPokerRoom(); // Ensure poker room is visible
                     if (shouldAnimateResetDeck) {
                         cardAnimator.animateCardsFaceDownBeforeReset(() => {
                             animateVotingCards = true;
                             updateUI();
                         });
                     } else {
                         if (didResetVotes) {
                             resetFaceDownBeforeStateUpdate = false;
                         }
                         updateUI(); // Update the UI with the new state
                     }
                 } else if (!loginSection.classList.contains('hidden')) {
                     // Still on login screen, do nothing until login action
                 } else {
                     // Was in room, but now not in participant list (e.g., kicked?)
                     console.log("User no longer in participant list. Returning to login.");
                     logout(); // Go back to login
                 }
             }
             break;

         case 'sessionEnded':
             handleSessionEnded(payload?.message || 'Session ended by facilitator.');
             break;

         case 'error':
             const errorMessage = payload?.message || 'Something went wrong.';
             console.error('Server Error:', errorMessage);
             if (pendingLoginContext) {
                 if (attemptedStoredRoomRestore) {
                     clearRoomSession();
                 }
                 pendingLoginContext = null;
             }
             if (isRoomVisible()) {
                 shouldFocusNextItemInput = false;
                 if (isEndSessionModalOpen()) {
                     showEndSessionError(errorMessage);
                     resetEndSessionButton();
                 } else {
                     showVoteError(errorMessage);
                 }
             } else if (isLoginVisible()) {
                 showLoginError(errorMessage);
             } else {
                 showLogin({ clearError: false });
                 showLoginError(errorMessage);
             }
             break;

         default:
             console.log(`Unknown message type received: ${type}`);
     }
 }

 // --- Send Message Helper ---
 function sendMessage(type, payload) {
     if (ws && ws.readyState === WebSocket.OPEN) {
         const message = JSON.stringify({ type, payload });
         console.log('Sending message:', message);
         ws.send(message);
     } else {
         console.error('WebSocket is not connected. Cannot send message.');
          updateConnectionStatus('disconnected', 'Disconnected');
          showLogin({ clearError: false });
          showLoginError('Connection lost. Please wait while the app reconnects.');
     }
 }

function getValidRole(value) {
    return Array.from(roleSelect.options).some((option) => option.value === value) ? value : '';
}

function clearRoomSession() {
    sessionStorage.removeItem(ROOM_SESSION_STORAGE);
    sessionStorage.removeItem(ROOM_RETURN_STORAGE);
}

function getStoredRoomSession() {
    try {
        const stored = JSON.parse(sessionStorage.getItem(ROOM_SESSION_STORAGE) || 'null');
        if (
            stored &&
            typeof stored.accessKey === 'string' &&
            typeof stored.room === 'string' &&
            typeof stored.name === 'string' &&
            getValidRole(stored.role)
        ) {
            return stored;
        }
    } catch (_err) {
        // Ignore malformed session data and fall back to the login screen.
    }

    clearRoomSession();
    return null;
}

function saveRoomSession(session) {
    sessionStorage.setItem(ROOM_SESSION_STORAGE, JSON.stringify({
        accessKey: session.accessKey,
        room: session.room,
        name: session.name,
        role: session.role
    }));
}

function persistRoomSession() {
    const storedSession = getStoredRoomSession();
    const session = pendingLoginContext || storedSession;
    if (!session || !currentUser || !currentRoom) return;

    saveRoomSession({
        ...session,
        room: currentRoom,
        name: currentUser.name,
        role: currentUser.role
    });
}

function restoreStoredRoomSession() {
    if (!allowStoredRoomRestore || attemptedStoredRoomRestore) return;
    if (sessionStorage.getItem(ROOM_RETURN_STORAGE) !== '1') return;

    const storedSession = getStoredRoomSession();
    if (!storedSession) return;

    attemptedStoredRoomRestore = true;
    sessionStorage.removeItem(ROOM_RETURN_STORAGE);
    accessKeyInput.value = storedSession.accessKey;
    roomInput.value = storedSession.room;
    nameInput.value = storedSession.name;
    roleSelect.value = storedSession.role;
    currentRoom = storedSession.room;
    pendingLoginContext = storedSession;
    sendMessage('login', storedSession);
}

function markRoomReturnFromAdmin() {
    if (currentUser?.role !== 'Facilitator') return;

    persistRoomSession();
    sessionStorage.setItem(ROOM_RETURN_STORAGE, '1');
}


 // --- Initialization ---
 function init() {
     const appliedInvitePrefill = applyInvitePrefill();
     allowStoredRoomRestore = !appliedInvitePrefill;
     setupEventListeners();
     connectWebSocket(); // Start WebSocket connection attempt
 }

 function applyInvitePrefill() {
     const params = new URLSearchParams(window.location.search);
     const invitedAccessKey = params.get('accessKey') || params.get('key');
     const invitedRoom = params.get('room');
     const invitedRole = params.get('role');
     let appliedPrefill = false;

     if (invitedAccessKey) {
         accessKeyInput.value = invitedAccessKey;
         appliedPrefill = true;
     }

     if (invitedRoom) {
         roomInput.value = invitedRoom;
         appliedPrefill = true;
     }

     if (invitedRole && Array.from(roleSelect.options).some((option) => option.value === invitedRole)) {
         roleSelect.value = invitedRole;
         appliedPrefill = true;
     }

     if (appliedPrefill && window.history.replaceState) {
         window.history.replaceState(null, document.title, window.location.pathname);
     }

     return appliedPrefill;
 }

 // --- Event Listeners ---
 function setupEventListeners() {
     loginButton.addEventListener('click', handleLogin);
     nameInput.addEventListener('keypress', (e) => {
         if (e.key === 'Enter' && !loginButton.disabled) handleLogin();
     });
     showVotesButton.addEventListener('click', handleShowVotes);
     startNextItemButton.addEventListener('click', handleStartNextItem);
     resetVotesButton.addEventListener('click', handleResetVotes);
     roundItemForm.addEventListener('submit', handleSetRoundItem);
     roundHistoryList.addEventListener('click', handleRoundHistoryAction);
     copyRoundHistoryButton.addEventListener('click', handleCopyAllRoundHistory);

     adminRoomLink.addEventListener('click', markRoomReturnFromAdmin);
     copyVoterInviteButton.addEventListener('click', handleCopyRoomInvite);
     copyObserverInviteButton.addEventListener('click', handleCopyRoomInvite);
     endSessionButton.addEventListener('click', openEndSessionModal);
     confirmEndSessionButton.addEventListener('click', handleConfirmEndSession);
     cancelEndSessionButton.addEventListener('click', closeEndSessionModal);
     logoutButton.addEventListener('click', logout);

     // Replace the old event binding:
     editRoleButton.addEventListener('click', openEditRoleModal);
     saveRoleButton.addEventListener('click', handleSaveRole);
     cancelEditRoleButton.addEventListener('click', closeEditRoleModal);
 }

 // Function to open modal and pre‐select current role
 function openEditRoleModal() {
 if (!currentUser) return;
 editRoleSelect.value = currentUser.role;
 editRoleError.classList.add('hidden');
 editRoleModal.classList.remove('hidden');
 }
 function closeEditRoleModal() {
 editRoleModal.classList.add('hidden');
 }

 function isEndSessionModalOpen() {
     return !endSessionModal.classList.contains('hidden');
 }

 function resetEndSessionButton() {
     confirmEndSessionButton.disabled = false;
     confirmEndSessionButton.textContent = 'End Session';
 }

 function showEndSessionError(message) {
     endSessionError.textContent = message;
     endSessionError.classList.remove('hidden');
 }

 function openEndSessionModal() {
     if (currentUser?.role !== 'Facilitator') return;

     endSessionError.classList.add('hidden');
     resetEndSessionButton();
     endSessionModal.classList.remove('hidden');
 }

 function closeEndSessionModal() {
     endSessionModal.classList.add('hidden');
     endSessionError.classList.add('hidden');
     resetEndSessionButton();
 }

 function handleConfirmEndSession() {
     if (currentUser?.role !== 'Facilitator') return;

     endSessionError.classList.add('hidden');
     confirmEndSessionButton.disabled = true;
     confirmEndSessionButton.textContent = 'Ending...';
     sendMessage('endSession', {});
 }

 // On save, send changeRole for self
 function handleSaveRole() {
 const newRole = editRoleSelect.value;
 if (!newRole) {
     editRoleError.textContent = 'Please select a role.';
     return editRoleError.classList.remove('hidden');
 }
 if (newRole !== currentUser.role) {
     sendMessage('changeRole', { targetUserId: currentUser.id, newRole });
 }
 closeEditRoleModal();
 }

 // --- View Management ---
 function showLogin({ clearError = true } = {}) {
     loginSection.classList.remove('hidden');
     pokerRoomSection.classList.add('hidden');
     if (clearError) {
         hideLoginError();
     }
     window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

     if (ws && ws.readyState === WebSocket.OPEN) {
         loginButton.disabled = false;
         loginButton.textContent = 'Enter Room';
     } else {
         loginButton.disabled = true;
         loginButton.textContent = 'Enter Room (Disconnected)';
     }
 }


 function showPokerRoom() {
     loginSection.classList.add('hidden');
     pokerRoomSection.classList.remove('hidden');
     window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
     // UI update will be triggered by receiving state from server
 }

 // --- UI Updates (Reflects state from server) ---
 function updateUI() {
    if (!currentUser) {
        // If no current user data, likely means we should be on login screen
        // This might happen if server removes user or connection drops unexpectedly
        console.log("updateUI called without currentUser, redirecting to login.");
        logout(); // Use logout to ensure clean state
        return;
    }

     // ─── 8.3.1) Show current room at the top of the poker room UI
  roomDisplay.textContent = currentRoom ? `Room: ${currentRoom}` : '';

    // Update greeting
    userGreeting.textContent = `Hello, ${currentUser.name} (${currentUser.role})`;

    renderCurrentItemPanel();
    renderRoundHistory();

    // Generate/Update Voting Cards
    renderVotingCards();

    // Render Participants List
    renderParticipantsList();

    // Show/Hide Facilitator Controls & Enable/Disable buttons
    if (currentUser.role === 'Facilitator') {
        facilitatorControls.classList.remove('hidden');
        adminRoomLink.classList.remove('hidden');
        showVotesButton.disabled = votesRevealed; // Disable if already revealed
        startNextItemButton.classList.toggle('hidden', !votesRevealed);
        startNextItemButton.disabled = !votesRevealed;
        resetVotesButton.disabled = false;
        copyVoterInviteButton.classList.remove('hidden');
        copyObserverInviteButton.classList.remove('hidden');
        endSessionButton.classList.remove('hidden');
    } else {
        facilitatorControls.classList.add('hidden');
        adminRoomLink.classList.add('hidden');
        startNextItemButton.classList.add('hidden');
        copyVoterInviteButton.classList.add('hidden');
        copyObserverInviteButton.classList.add('hidden');
        endSessionButton.classList.add('hidden');
    }

    // Show/Hide Observer Message & Disable Voting Cards
    if (currentUser.role === 'Observer') {
        observerMessage.classList.remove('hidden');
        votingCardsContainer.classList.add('is-disabled'); // Disable clicks
    } else {
        observerMessage.classList.add('hidden');
        votingCardsContainer.classList.remove('is-disabled');
    }

    // Show/Hide Vote Summary & Calculate Average
    if (votesRevealed) {
        voteSummary.classList.remove('hidden');
        calculateAndDisplayAverage();

        // Build an array of { name, vote }, sorted descending
        const voteEntries = participants
            .filter(p => (p.role === 'Voter' || p.role === 'Facilitator') && p.vote !== null && !isNaN(parseInt(p.vote)))
            .map(p => ({ name: p.name, vote: parseInt(p.vote) }))
            .sort((a, b) => b.vote - a.vote);

        const orderedContainer = document.getElementById('ordered-votes');
        const orderedList = document.getElementById('ordered-votes-list');
        orderedList.innerHTML = '';

        // Group by vote value: { 8: ['John','David'], 5: ['Mike','Steve'], ... }
        const groups = {};
        voteEntries.forEach(({ name, vote }) => {
            if (!groups[vote]) groups[vote] = [];
            groups[vote].push(name);
        });

        // Sort vote values descending.
        const sortedVotes = Object.keys(groups)
            .map(v => parseInt(v))
            .sort((a, b) => b - a);

        // Render each group as "Name1, Name2, …    —— voteValue"
        sortedVotes.forEach(voteValue => {
            const names = groups[voteValue].join(', ');
            const line = document.createElement('div');
            line.className = 'result-row';

            const namesSpan = document.createElement('span');
            namesSpan.className = 'result-names';
            namesSpan.textContent = names;

            const voteSpan = document.createElement('span');
            voteSpan.className = 'result-value';
            voteSpan.textContent = voteValue;

            line.appendChild(namesSpan);
            line.appendChild(voteSpan);
            orderedList.appendChild(line);
        });

        // Show container only if at least one group exists
        if (sortedVotes.length > 0) {
            orderedContainer.classList.remove('hidden');
        }
    } else {
        voteSummary.classList.add('hidden');

        // Hide ordered results when votes are reset or hidden
        document.getElementById('ordered-votes').classList.add('hidden');
    }
}

function renderCurrentItemPanel() {
    const displayTitle = currentItem || 'No item set';
    currentItemDisplay.textContent = displayTitle;
    currentItemDisplay.classList.toggle('is-empty', !currentItem);
    resultItemName.textContent = currentItem || 'Untitled item';

    roundStatus.textContent = votesRevealed ? 'Revealed' : 'Open';
    roundStatus.classList.toggle('is-locked', votesRevealed);

    if (currentUser?.role === 'Facilitator') {
        roundItemForm.classList.remove('hidden');
        roundItemInput.disabled = votesRevealed;
        roundItemSaveButton.disabled = votesRevealed;
        if (document.activeElement !== roundItemInput) {
            roundItemInput.value = currentItem;
        }

        if (shouldFocusNextItemInput && !votesRevealed) {
            shouldFocusNextItemInput = false;
            roundItemInput.focus();
            roundItemInput.select();
        }
    } else {
        roundItemForm.classList.add('hidden');
    }

    roundItemError.classList.add('hidden');
}

function renderRoundHistory() {
    roundHistoryList.innerHTML = '';

    if (!roundHistory.length) {
        roundHistorySection.classList.add('hidden');
        copyRoundHistoryButton.classList.add('hidden');
        return;
    }

    roundHistorySection.classList.remove('hidden');
    copyRoundHistoryButton.classList.toggle('hidden', currentUser?.role !== 'Facilitator');
    roundHistory.forEach((round) => {
        const article = document.createElement('article');
        article.className = 'round-history-item';

        const header = document.createElement('div');
        header.className = 'round-history-header';

        const title = document.createElement('h3');
        title.className = 'round-history-title';
        title.textContent = getRoundTitle(round);

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'text-action round-copy-action';
        copyButton.dataset.roundId = round.id;
        copyButton.textContent = 'Copy summary';

        header.appendChild(title);
        header.appendChild(copyButton);
        article.appendChild(header);

        const meta = document.createElement('div');
        meta.className = 'round-history-meta';
        meta.appendChild(createMetaText(`Average ${round.average || '--'}`));
        meta.appendChild(createMetaText(`${round.voteCount || 0} vote${round.voteCount === 1 ? '' : 's'}`));
        meta.appendChild(createMetaText(formatRoundRevealedAt(round.revealedAt)));
        article.appendChild(meta);

        const groups = document.createElement('div');
        groups.className = 'round-history-groups';
        const roundGroups = Array.isArray(round.groups) ? round.groups : [];

        if (roundGroups.length) {
            roundGroups.forEach((group) => {
                const row = document.createElement('div');
                row.className = 'round-history-group';

                const vote = document.createElement('span');
                vote.textContent = group.vote;

                const names = document.createElement('span');
                names.textContent = Array.isArray(group.names) ? group.names.join(', ') : '';

                row.appendChild(vote);
                row.appendChild(names);
                groups.appendChild(row);
            });
        } else {
            const empty = document.createElement('p');
            empty.className = 'admin-empty';
            empty.textContent = 'No votes recorded.';
            groups.appendChild(empty);
        }

        article.appendChild(groups);
        roundHistoryList.appendChild(article);
    });
}

function createMetaText(text) {
    const span = document.createElement('span');
    span.textContent = text;
    return span;
}

function getRoundTitle(round) {
    return round?.title || 'Untitled item';
}

function formatRoundRevealedAt(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Revealed';

    return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function createRoundSummaryText(round) {
    const lines = [
        `Sprint Poker estimate: ${getRoundTitle(round)}`,
        `Average: ${round.average || '--'}`,
        `Votes: ${round.voteCount || 0}`
    ];

    appendRoundSpread(lines, round);
    return lines.join('\n');
}

function createAllRoundHistorySummaryText(rounds) {
    const chronologicalRounds = [...rounds].reverse();
    const lines = [
        'Sprint Poker session summary',
        `Rounds: ${chronologicalRounds.length}`
    ];

    chronologicalRounds.forEach((round, index) => {
        lines.push(
            '',
            `${index + 1}. ${getRoundTitle(round)}`,
            `Average: ${round.average || '--'}`,
            `Votes: ${round.voteCount || 0}`
        );
        appendRoundSpread(lines, round);
    });

    return lines.join('\n');
}

function appendRoundSpread(lines, round) {
    const groups = Array.isArray(round.groups) ? round.groups : [];
    if (groups.length) {
        lines.push('Spread:');
        groups.forEach((group) => {
            const names = Array.isArray(group.names) ? group.names.join(', ') : '';
            lines.push(`- ${group.vote}: ${names}`);
        });
    }
}

async function copyText(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
}


function renderVotingCards() {
    cardAnimator.clear();

    votingCardsContainer.innerHTML = '';
    votingCardsContainer.appendChild(observerMessage);

    fibonacciVotes.forEach(value => {
        const canVote = currentUser && currentUser.role !== 'Observer';
        const cardButton = cardDeck.createVotingCard({
            document,
            value,
            selected: currentUser?.vote === value,
            disabled: currentUser?.role === 'Observer' || votesRevealed,
            onClick: canVote ? handleVote : null
        });

        votingCardsContainer.appendChild(cardButton);
    });

    // Only animate if votes are not revealed
    if (!votesRevealed && animateVotingCards) {
        cardAnimator.animateCardsIntoView();
        animateVotingCards = false;
    }
}

 function renderParticipantsList() {
     participantsListContainer.innerHTML = ''; // Clear list

     // Sort participants: current user first, then alphabetically by name
     const sortedParticipants = [...participants].sort((a, b) => {
         if (a.id === currentUser?.id) return -1; // Use optional chaining
         if (b.id === currentUser?.id) return 1;
         return a.name.localeCompare(b.name);
     });


     sortedParticipants.forEach(participant => {
         const div = document.createElement('div');
         div.classList.add('participant-row');

         // --- Left side: Name and Role ---
         const nameRoleDiv = document.createElement('div');
         nameRoleDiv.classList.add('participant-info'); // Allow wrapping and spacing

         const nameSpan = document.createElement('span');
         nameSpan.textContent = participant.name;
         nameSpan.classList.add('participant-name');
         if (participant.id === currentUser?.id) {
             nameSpan.textContent += ' (You)';
             nameSpan.classList.add('is-current-user');
         }
         nameRoleDiv.appendChild(nameSpan);

         const roleSpan = document.createElement('span');
         roleSpan.textContent = `(${participant.role})`; // Display role clearly
         roleSpan.classList.add('participant-role');
          if (participant.id === facilitatorId) {
              roleSpan.textContent += ' Lead'; // Indicate Facilitator
              roleSpan.classList.add('is-facilitator');
          }
         nameRoleDiv.appendChild(roleSpan);

          // --- Role change controls (for Facilitator view) ---
          if (currentUser?.role === 'Facilitator' && participant.id !== currentUser.id) {
              const controlsDiv = document.createElement('div');
              controlsDiv.classList.add('participant-role-controls'); // Spacing and wrapping for controls

              // Select dropdown for roles
              const roleSelect = document.createElement('select');
              roleSelect.classList.add('participant-role-select');
              const roles = ['Voter', 'Observer', 'Facilitator'];
              roles.forEach(r => {
                  const option = document.createElement('option');
                  option.value = r;
                  option.textContent = r;
                  if (r === participant.role) {
                      option.selected = true;
                  }
                  roleSelect.appendChild(option);
              });
              roleSelect.addEventListener('change', (e) => {
                  handleChangeRole(participant.id, e.target.value);
              });
              controlsDiv.appendChild(roleSelect);

              nameRoleDiv.appendChild(controlsDiv); // Add controls below/beside name/role
          }


         div.appendChild(nameRoleDiv);

         // --- Right side: Vote display / Card placeholder ---
         const voteContainer = document.createElement('div');
         voteContainer.classList.add('card-container', 'participant-vote'); // Prevent shrinking
         voteContainer.dataset.userId = participant.id; // Link container to user

         const card = document.createElement('div');
         card.classList.add('card');
         // Determine flip state based on global votesRevealed and if participant voted
         if (votesRevealed && participant.vote !== null) {
             card.classList.add('flipped');
         }

         const cardFaceFront = document.createElement('div');
         cardFaceFront.classList.add('card-face', 'card-front');
         cardFaceFront.textContent = '♢'; // Symbol for card back

         const cardFaceBack = document.createElement('div');
         cardFaceBack.classList.add('card-face', 'card-back');
         // Show vote value only if revealed, otherwise show placeholder
         cardFaceBack.textContent = (votesRevealed && participant.vote !== null) ? participant.vote : '--';

         card.appendChild(cardFaceFront);
         card.appendChild(cardFaceBack);
         voteContainer.appendChild(card);

         // Show checkmark if voted (and votes not revealed yet)
         // Position checkmark relative to card-container
         if (!votesRevealed && participant.vote !== null && participant.role !== 'Observer') {
              const checkMark = document.createElement('span');
              checkMark.textContent = '✓';
              checkMark.classList.add('vote-checkmark');
              voteContainer.appendChild(checkMark);
         }

         div.appendChild(voteContainer);
         participantsListContainer.appendChild(div);
     });
 }

 // --- Event Handlers (Send messages to server) ---
 function showRoundItemError(message) {
  roundItemError.textContent = message;
  roundItemError.classList.remove('hidden');
 }

 function handleSetRoundItem(event) {
  event.preventDefault();

  if (currentUser?.role !== 'Facilitator') return;

  const itemTitle = roundItemInput.value.trim();
  if (!itemTitle) {
    showRoundItemError('Enter an item name.');
    return;
  }

  roundItemError.classList.add('hidden');
  sendMessage('setRoundItem', { itemTitle });
 }

 async function handleRoundHistoryAction(event) {
  const copyButton = event.target.closest('.round-copy-action');
  if (!copyButton) return;

  const round = roundHistory.find((entry) => entry.id === copyButton.dataset.roundId);
  if (!round) return;

  const originalText = copyButton.textContent;
  copyButton.disabled = true;

  try {
    await copyText(createRoundSummaryText(round));
    copyButton.textContent = 'Copied';
  } catch (_err) {
    copyButton.textContent = 'Copy failed';
  } finally {
    setTimeout(() => {
      copyButton.disabled = false;
      copyButton.textContent = originalText;
    }, 1600);
  }
 }

 async function handleCopyAllRoundHistory() {
  if (currentUser?.role !== 'Facilitator' || !roundHistory.length) return;

  const originalText = copyRoundHistoryButton.textContent;
  copyRoundHistoryButton.disabled = true;

  try {
    await copyText(createAllRoundHistorySummaryText(roundHistory));
    copyRoundHistoryButton.textContent = 'Copied all';
  } catch (_err) {
    copyRoundHistoryButton.textContent = 'Copy failed';
  } finally {
    setTimeout(() => {
      copyRoundHistoryButton.disabled = false;
      copyRoundHistoryButton.textContent = originalText;
    }, 1600);
  }
 }

 function createRoomInviteUrl(role) {
  const storedSession = getStoredRoomSession();
  const accessKey = storedSession?.accessKey;
  const room = currentRoom || storedSession?.room;
  if (!accessKey || !room) return '';

  const inviteUrl = new URL('/', window.location.origin);
  inviteUrl.searchParams.set('accessKey', accessKey);
  inviteUrl.searchParams.set('room', room);
  inviteUrl.searchParams.set('role', role);
  return inviteUrl.toString();
 }

 async function handleCopyRoomInvite(event) {
  if (currentUser?.role !== 'Facilitator') return;

  const button = event.currentTarget;
  const role = button.dataset.inviteRole;
  const inviteUrl = createRoomInviteUrl(role);
  if (!inviteUrl) {
    showVoteError('Invite link unavailable. Rejoin the room and try again.');
    return;
  }

  const originalText = button.textContent;
  button.disabled = true;

  try {
    await copyText(inviteUrl);
    button.textContent = `Copied ${role.toLowerCase()} invite`;
  } catch (_err) {
    button.textContent = 'Copy failed';
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = originalText;
    }, 1600);
  }
 }

 function handleLogin() {
  const key = accessKeyInput.value.trim();
  const name = nameInput.value.trim();
  const role = roleSelect.value;
  const room = roomInput.value.trim();

  if (key && name && role && room) {
    hideLoginError();
    currentRoom = room;
    pendingLoginContext = { accessKey: key, name, role, room };
    sendMessage('login', {
      accessKey: key,
      name: name,
      role: role,
      room: room
    });
  } else {
    showLoginError('Please enter your key, room name, name, and role.');
  }
}

 function handleVote(event) {

    if (votesRevealed || !currentUser || currentUser.role === 'Observer') return;
        const selectedValue = event.currentTarget.dataset.value; // Use currentTarget!
        sendMessage('vote', { vote: selectedValue });
        document.querySelectorAll('.vote-card').forEach(btn => btn.classList.remove('selected'));
        event.currentTarget.classList.add('selected');
    }

 function handleShowVotes() {
      if (currentUser?.role === 'Facilitator' && !votesRevealed) {
         sendMessage('revealVotes', {});
     }
 }

 function handleStartNextItem() {
     if (currentUser?.role === 'Facilitator' && votesRevealed) {
         shouldFocusNextItemInput = true;
         startNextItemButton.disabled = true;
         sendMessage('startNextItem', {});
     }
 }

 function resetAllCards() {

     document.querySelectorAll('.card').forEach(card => card.classList.remove('flipped'));
 }

 function handleResetVotes() {
     animateVotingCards = true;
      if (currentUser?.role === 'Facilitator') {
         resetVotesButton.disabled = true;
         resetFaceDownBeforeStateUpdate = true;
         cardAnimator.animateCardsFaceDownBeforeReset(() => {
             sendMessage('resetVotes', {});
             resetAllCards();
         });
     }
 }

  function handleChangeRole(targetUserId, newRole) {
      if (currentUser?.role === 'Facilitator') {
          console.log(`Requesting role change for ${targetUserId} to ${newRole}`);
          sendMessage('changeRole', { targetUserId: targetUserId, newRole: newRole });
      }
  }

  function resetRoomState() {
     currentUser = null;
     participants = [];
     votesRevealed = false;
     facilitatorId = null;
     currentItem = '';
     roundHistory = [];
     currentRoom = null;
     pendingLoginContext = null;

     // Clear session
     sessionStorage.removeItem('scrumPokerUserId');
     sessionStorage.removeItem('scrumPokerUserName');
     clearRoomSession();
  }

  function handleSessionEnded(message) {
     console.log('Session ended by facilitator.');
     resetRoomState();
     closeEditRoleModal();
     closeEndSessionModal();
     showLogin({ clearError: false });
     showLoginError(message);
     updateConnectionStatus('connected', 'Connected');
  }

  function logout() {
     console.log("Logging out.");

     // Clear state and session
     resetRoomState();


     // Send logout to server
     if (ws && ws.readyState === WebSocket.OPEN) {
         sendMessage('logout', {});
     }

     // Return to login screen
     showLogin();
     updateConnectionStatus('connected', 'Connected');
 }

 // --- Calculations (Uses local state derived from server) ---
 function calculateAndDisplayAverage() {
     let sum = 0;
     let numericVoteCount = 0;

     participants.forEach(p => {
         // Only include numeric votes from Voters or Facilitators
         if ((p.role === 'Voter' || p.role === 'Facilitator') && p.vote !== null && !isNaN(parseInt(p.vote))) {
             sum += parseInt(p.vote);
             numericVoteCount++;
         }
     });

     const average = numericVoteCount > 0 ? (sum / numericVoteCount).toFixed(1) : '--';
     averageVoteSpan.textContent = average;
 }

 // --- Start the application ---
 init();



 
