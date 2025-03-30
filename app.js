const express = require('express')
const socket = require('socket.io')
const http = require('http')
const path = require('path')
const cookieParser = require('cookie-parser')  // Import cookie-parser
const { Chess } = require('chess.js')

const app = express()
const server = http.createServer(app)
const io = socket(server)
const chess = new Chess()

let players = { white: null, black: null };
let playerNames = { white: '', black: '' };

app.set('view engine', 'ejs')
app.use(express.static(path.join(__dirname, 'public')))

app.use(express.urlencoded({ extended: true })) // Ensure form data is parsed
app.use(cookieParser())  // Enable cookie parsing middleware

app.get("/", (req, res) => {
    res.render("login");
});

// Middleware to check if user is logged in
function isAuthenticated(req, res, next) {
    if (req.cookies && req.cookies.username) {
        return next() // Allow access
    } else {
        res.redirect('/') // Redirect to login if no username
    }
}

// Handle login submission
app.post('/login', (req, res) => {
    if (req.body.username) {
        res.cookie("username", req.body.username, { path: "/" });
        res.redirect('/waitingroom'); // Redirect to waiting page after login
    } else {
        res.redirect('/'); // Redirect back to login if no username provided
    }
});

// Waiting room route
app.get('/waitingroom', isAuthenticated, (req, res) => {
    res.render('waitingroom', { username: req.cookies.username }); // Show waiting page
});

// Route to render the game page
app.get('/index', isAuthenticated, (req, res) => {
    res.render('index', { 
        playerWhite: playerNames.white, 
        playerBlack: playerNames.black,
        username: req.cookies.username  // Pass the username to the template
    }); 
});

io.on('connection', function (uniquesocket) {
    console.log('Socket connected!')

    const cookies = uniquesocket.handshake.headers.cookie || '';
    const usernameCookie = cookies.split('; ').find(row => row.startsWith('username='));
    const username = usernameCookie ? usernameCookie.split('=')[1] : 'Guest';

    if (!players.white) {
        players.white = uniquesocket.id;
        playerNames.white = username;
        uniquesocket.emit('playerRole', 'w');
    } else if (!players.black) {
        players.black = uniquesocket.id;
        playerNames.black = username;
        uniquesocket.emit('playerRole', 'b');

        // Notify waiting player to load the game
        io.to(players.white).emit('startGame', { white: playerNames.white, black: playerNames.black });
        io.to(players.black).emit('startGame', { white: playerNames.white, black: playerNames.black });
    } else {
        uniquesocket.emit('spectatorRole');
    }

    uniquesocket.on('disconnect', function () {
        if (uniquesocket.id === players.white) {
            players.white = null;
            playerNames.white = '';
        } else if (uniquesocket.id === players.black) {
            players.black = null;
            playerNames.black = '';
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
    console.log('Server is listening on port 5001')
});