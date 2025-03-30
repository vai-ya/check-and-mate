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

let players = {}

app.set('view engine', 'ejs')
app.use(express.static(path.join(__dirname, 'public')))
app.use(express.urlencoded({ extended: true })) // Parse form data
app.use(cookieParser())

// Show login page
app.get("/", (req, res) => {
    res.render("login");
});

// Middleware to check if user is logged in
function isAuthenticated(req, res, next) {
    if (req.cookies.username) {
        return next();
    } else {
        res.redirect('/');
    }
}

// Handle login and set username in cookies
app.post('/login', (req, res) => {
    const username = req.body.username;
    if (username) {
        res.cookie('username', username, { httpOnly: true });
        res.redirect('/game'); // Redirect to the game page
    } else {
        res.redirect('/'); // Redirect back to login if no username
    }
});

// Serve the game page only if authenticated
app.get('/game', isAuthenticated, (req, res) => {
    res.render('index', { username: req.cookies.username });
});

io.on('connection', function (uniquesocket) {
    console.log('Socket connected!');

    if (!players.white) {
        players.white = uniquesocket.id;
        uniquesocket.emit('playerRole', 'w');
    } else if (!players.black) {
        players.black = uniquesocket.id;
        uniquesocket.emit('playerRole', 'b');
    } else {
        uniquesocket.emit('spectatorRole');
    }

    uniquesocket.on('disconnect', function () {
        if (uniquesocket.id === players.white) {
            delete players.white;
        } else if (uniquesocket.id === players.black) {
            delete players.black;
        }
    });

    uniquesocket.on('move', (move) => {
        try {
            if (chess.turn() === 'w' && uniquesocket.id !== players.white) return;
            if (chess.turn() === 'b' && uniquesocket.id !== players.black) return;

            const result = chess.move(move);
            if (result) {
                io.emit('move', move);
                io.emit('boardState', chess.fen());
            } else {
                console.log('Invalid move:', move);
                uniquesocket.emit('Invalid Move:', move);
            }
        } catch (err) {
            console.log(err);
            uniquesocket.emit('Invalid Move:', move);
        }
    });
});

server.listen(5001, function () {
    console.log('Server is listening on port 5001');
});
