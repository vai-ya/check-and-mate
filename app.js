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

let waitingPlayers = [];
let activeGames = {};

app.get("/", (req, res) => {
    res.render("login");
});

function isAuthenticated(req, res, next) {
    if (req.cookies && req.cookies.username) {
        return next();
    } else {
        res.redirect('/');
    }
}

app.post('/login', (req, res) => {
    if (req.body.username) {
        res.cookie("username", req.body.username, { path: "/" });
        res.redirect('/waitingroom');
    } else {
        res.redirect('/');
    }
});

app.get('/waitingroom', isAuthenticated, (req, res) => {
    res.render('waitingroom', { username: req.cookies.username });
});

app.get('/index', isAuthenticated, (req, res) => {
    res.render('index', {
        username: req.cookies.username
    });
});

io.on('connection', (socket) => {

    const cookies = socket.handshake.headers.cookie || '';
    const usernameCookie = cookies.split('; ').find(row => row.startsWith('username='));
    const username = usernameCookie ? usernameCookie.split('=')[1] : 'Guest';

    socket.username = username;

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

    } else {
        waitingPlayers.push(socket);
    }

    socket.on('disconnect', () => {
        waitingPlayers = waitingPlayers.filter(player => player.id !== socket.id);
        for (let gameId in activeGames) {
            if (activeGames[gameId].white.id === socket.id || activeGames[gameId].black.id === socket.id) {
                delete activeGames[gameId];
                break;
            }
        }
    });

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

let totalPlayers=0;

io.on('connection', (socket) => {
    totalPlayers++;
    io.emit('player_count_change', totalPlayers);

    socket.on('disconnect', () => {
        totalPlayers--;
        io.emit('player_count_change', totalPlayers);
    });
});


const PORT = process.env.PORT || 5001;

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
