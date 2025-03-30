const express = require('express')
const socket = require('socket.io')
const http = require('http')
const path = require('path')
const cookieParser = require('cookie-parser')
const { Chess } = require('chess.js')

const app = express()
const server = http.createServer(app)
const io = socket(server)
const chess = new Chess()

app.set('view engine', 'ejs')
app.use(express.static(path.join(__dirname, 'public')))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

let waitingPlayers = []; // Queue for matchmaking
let activeGames = {}; // Store active games with socket IDs

app.get("/", (req, res) => {
    res.render("login");
});

// Middleware to check if user is logged in
function isAuthenticated(req, res, next) {
    if (req.cookies && req.cookies.username) {
        return next();
    } else {
        res.redirect('/');
    }
}

// Handle login submission
app.post('/login', (req, res) => {
    if (req.body.username) {
        res.cookie("username", req.body.username, { path: "/" });
        res.redirect('/waitingroom');
    } else {
        res.redirect('/');
    }
});

// Waiting room route
app.get('/waitingroom', isAuthenticated, (req, res) => {
    res.render('waitingroom', { username: req.cookies.username });
});

// Route to render the game page
app.get('/index', isAuthenticated, (req, res) => {
    res.render('index', {
        username: req.cookies.username
    });
});

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    const cookies = socket.handshake.headers.cookie || '';
    const usernameCookie = cookies.split('; ').find(row => row.startsWith('username='));
    const username = usernameCookie ? usernameCookie.split('=')[1] : 'Guest';

    socket.username = username;

    // Player matchmaking logic
    if (waitingPlayers.length > 0) {
        const opponent = waitingPlayers.shift();
        const gameId = `game_${opponent.id}_${socket.id}`;

        activeGames[gameId] = { white: opponent, black: socket };

        opponent.join(gameId);
        socket.join(gameId);

        opponent.emit('playerRole', 'w');
        socket.emit('playerRole', 'b');

        io.to(gameId).emit('startGame', {
            white: opponent.username,
            black: socket.username
        });

        console.log(`Match created: ${opponent.username} (White) vs ${socket.username} (Black)`);
    } else {
        // No waiting players, add the current player to the queue
        waitingPlayers.push(socket);
        console.log(`${socket.username} is waiting for an opponent.`);
    }

    // Handle player disconnection
    socket.on('disconnect', () => {
        waitingPlayers = waitingPlayers.filter(player => player.id !== socket.id);
        console.log(`Player disconnected: ${socket.username}`);

        // Remove from active games
        for (let gameId in activeGames) {
            if (activeGames[gameId].white.id === socket.id || activeGames[gameId].black.id === socket.id) {
                delete activeGames[gameId];
                break;
            }
        }
    });


    // Handle chess moves
    socket.on('move', (move) => {
        try {
            let gameId = Object.keys(activeGames).find(gameId => 
                activeGames[gameId].white.id === socket.id || 
                activeGames[gameId].black.id === socket.id
            );
    
            if (!gameId) return;
    
            let game = activeGames[gameId];
    
            if (chess.turn() === 'w' && socket.id !== game.white.id) return;
            if (chess.turn() === 'b' && socket.id !== game.black.id) return;
    
            const result = chess.move(move);
    
            if (result) {
                io.to(gameId).emit('move', { color: chess.turn(), san: result.san });
                io.to(gameId).emit('boardState', chess.fen());
    
                // Check for checkmate
                if (chess.isCheckmate()) {
                    const winner = chess.turn() === 'w' ? game.black.username : game.white.username;
                    const loser = chess.turn() === 'w' ? game.white.username : game.black.username;
    
                    io.to(gameId).emit('gameOver', { winner, loser });
                }
            } else {
                socket.emit('invalidMove', move);
            }
        } catch (err) {
            console.log(err);
            socket.emit('invalidMove', move);
        }
    });
    
});

server.listen(5001, () => {
    console.log('Server is listening on port 5001');
});
