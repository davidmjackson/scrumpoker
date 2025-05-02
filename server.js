// --- Scrum Poker WebSocket Server (server.js) ---
// Requires Node.js and the 'ws' library: npm install ws

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid'); // Using uuid for unique user IDs: npm install uuid

const PORT = process.env.PORT || 3000; // Port to run the server on

// Create a WebSocket server instance
const wss = new WebSocket.Server({ port: PORT });

// --- Server State ---
let participants = {}; // Store participant data { userId: { id, ws, name, role, vote } }
let votesRevealed = false;
let facilitatorId = null; // Track the current facilitator

console.log(`WebSocket server started on port ${PORT}`);

// --- Helper Functions ---

// Broadcast a message to all connected clients
function broadcast(message, senderWs = null) {
    const data = JSON.stringify(message);
    console.log(`Broadcasting: ${data}`);
    wss.clients.forEach(client => {
        // Optionally skip sending back to the original sender if needed
        // if (client !== senderWs && client.readyState === WebSocket.OPEN) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// Send a message to a specific client
function sendToClient(ws, message) {
     if (ws.readyState === WebSocket.OPEN) {
        const data = JSON.stringify(message);
        console.log(`Sending to client ${participants[ws.userId]?.name || 'Unknown'}: ${data}`);
        ws.send(data);
     }
}


// Get the current state of the room (participants, votes revealed status)
function getRoomState() {
    // Don't send the WebSocket object itself to clients
    const participantList = Object.values(participants).map(({ ws, ...rest }) => rest);
    return {
        type: 'updateState',
        payload: {
            participants: participantList,
            votesRevealed: votesRevealed,
            facilitatorId: facilitatorId
        }
    };
}

// Assign facilitator role (first user or handle reassignment)
function assignFacilitator() {
    // If no facilitator or the current facilitator disconnected
    if (!facilitatorId || !participants[facilitatorId]) {
        const participantIds = Object.keys(participants);
        if (participantIds.length > 0) {
            // Assign to the first person in the list (can be improved)
            facilitatorId = participantIds[0];
            if (participants[facilitatorId]) {
                 participants[facilitatorId].role = 'Facilitator';
                 console.log(`Assigned Facilitator role to: ${participants[facilitatorId].name}`);
            } else {
                facilitatorId = null; // Should not happen, but safety check
            }
        } else {
            facilitatorId = null; // No users left
             console.log(`No users left, clearing facilitator.`);
        }
    } else if (participants[facilitatorId]) {
         // Ensure the current facilitator still has the role set correctly
         participants[facilitatorId].role = 'Facilitator';
    }
}


// --- WebSocket Event Handling ---

wss.on('connection', (ws) => {
    // Assign a unique ID to the new connection
    const userId = uuidv4();
    ws.userId = userId; // Attach userId to the WebSocket object for reference
    console.log(`Client connected: ${userId}`);

    // Send the initial state (empty participants list for now) and their new ID
     sendToClient(ws, { type: 'yourId', payload: { id: userId } });
     // Send current room state immediately so they see existing users
     sendToClient(ws, getRoomState());


    // Handle messages received from a client
    ws.on('message', (message) => {
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message);
            console.log(`Received from ${userId}:`, parsedMessage);
        } catch (error) {
            console.error('Failed to parse message or invalid message format:', message, error);
            sendToClient(ws, { type: 'error', payload: { message: 'Invalid message format.' } });
            return;
        }

        const { type, payload } = parsedMessage;
        const currentUser = participants[userId]; // Get user data associated with this ws connection

        // --- Message Handling Logic ---
        switch (type) {
            case 'login':
                if (!payload || !payload.name || !payload.role) {
                     sendToClient(ws, { type: 'error', payload: { message: 'Login requires a name and role.' } });
                     return;
                }
                // Add new participant
                participants[userId] = {
                    id: userId,
                    ws: ws, // Keep reference to the WebSocket object
                    name: payload.name,
                    role: payload.role, // Default role
                    vote: null
                };


                
              //  assignFacilitator(); // Check and assign facilitator role if needed
                console.log(`User logged in: ${payload.name} (${userId}), Role: ${participants[userId].role}`);
                broadcast(getRoomState()); // Broadcast updated state to everyone
                break;

            case 'vote':
                 if (!currentUser) { sendToClient(ws, { type: 'error', payload: { message: 'Not logged in.' } }); return; }
                 if (currentUser.role === 'Observer') { sendToClient(ws, { type: 'error', payload: { message: 'Observers cannot vote.' } }); return; }
                 if (votesRevealed) { sendToClient(ws, { type: 'error', payload: { message: 'Votes already revealed, reset first.' } }); return; }
                 if (payload && typeof payload.vote !== 'undefined') {
                    currentUser.vote = payload.vote;
                    console.log(`User ${currentUser.name} voted: ${payload.vote}`);
                    // Broadcast the updated state (shows who has voted, but not the value yet)
                    broadcast(getRoomState());
                 } else {
                     sendToClient(ws, { type: 'error', payload: { message: 'Invalid vote payload.' } });
                 }
                break;

            case 'revealVotes':
                 if (!currentUser) { sendToClient(ws, { type: 'error', payload: { message: 'Not logged in.' } }); return; }
                 if (currentUser.role !== 'Facilitator') { sendToClient(ws, { type: 'error', payload: { message: 'Only Facilitators can reveal votes.' } }); return; }
                 if (votesRevealed) return; // Already revealed

                votesRevealed = true;
                console.log(`Votes revealed by ${currentUser.name}`);
                broadcast(getRoomState()); // Broadcast state change (now includes revealed votes)
                break;

            case 'resetVotes':
                 if (!currentUser) { sendToClient(ws, { type: 'error', payload: { message: 'Not logged in.' } }); return; }
                 if (currentUser.role !== 'Facilitator') { sendToClient(ws, { type: 'error', payload: { message: 'Only Facilitators can reset votes.' } }); return; }

                votesRevealed = false;
                // Reset votes for everyone
                Object.values(participants).forEach(p => p.vote = null);
                console.log(`Votes reset by ${currentUser.name}`);
                broadcast(getRoomState()); // Broadcast reset state
                break;

   

                case 'changeRole': {
                    if (!currentUser) {
                        return sendToClient(ws, { type: 'error', payload: { message: 'Not logged in.' } });
                    }
                    const { targetUserId, newRole } = payload || {};
                    if (!newRole) {
                        return sendToClient(ws, { type: 'error', payload: { message: 'Missing new role.' } });
                    }
                
                    const allowed = ['Voter', 'Observer', 'Facilitator'];
                    if (!allowed.includes(newRole)) {
                        return sendToClient(ws, { type: 'error', payload: { message: 'Invalid role specified.' } });
                    }
                
                    // If no targetUserId, assume self-change
                    const uid = targetUserId || currentUser.id;
                    const target = participants[uid];
                    if (!target) {
                        return sendToClient(ws, { type: 'error', payload: { message: 'User not found.' } });
                    }
                
                    // Only facilitators can change others’ roles
                    if (uid !== currentUser.id && currentUser.role !== 'Facilitator') {
                        return sendToClient(ws, { type: 'error', payload: { message: 'Only facilitators can change other users’ roles.' } });
                    }
                
                    // Handle facilitator assignment/demotion
                    if (newRole === 'Facilitator') {
                        if (facilitatorId && facilitatorId !== uid && participants[facilitatorId]) {
                            participants[facilitatorId].role = 'Voter';
                        }
                        facilitatorId = uid;
                    } else if (uid === facilitatorId && newRole !== 'Facilitator') {
                        facilitatorId = null;
                    }
                
                    target.role = newRole;
                    console.log(`Role for ${target.name} changed to ${newRole} by ${currentUser.name}`);
                    broadcast(getRoomState());
                    break;
                }

            default:
                console.log(`Unknown message type received: ${type}`);
                 sendToClient(ws, { type: 'error', payload: { message: `Unknown message type: ${type}` } });
        }
    });

    // Handle client disconnection
    ws.on('close', () => {
        const disconnectedUser = participants[userId];
        if (disconnectedUser) {
            console.log(`Client disconnected: ${disconnectedUser.name} (${userId})`);
            delete participants[userId]; // Remove participant from state

             // If the facilitator disconnected, assign a new one
             if (userId === facilitatorId) {
                 console.log("Facilitator disconnected. Assigning a new one...");
                 facilitatorId = null;
                 assignFacilitator();
             }

            broadcast(getRoomState()); // Broadcast updated state
        } else {
             console.log(`Client disconnected: ${userId} (was not fully logged in)`);
        }
    });

    // Handle WebSocket errors
    ws.on('error', (error) => {
        console.error(`WebSocket error for user ${userId}:`, error);
        // Attempt to remove participant if an error occurs
        if (participants[userId]) {
             delete participants[userId];
             if (userId === facilitatorId) {
                 facilitatorId = null;
                 assignFacilitator();
             }
             broadcast(getRoomState());
        }
    });

wss.on('connection', (ws, req) => {
    console.log("New WebSocket connection from:", req.headers['sec-websocket-key']);
});





});
