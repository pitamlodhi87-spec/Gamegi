import React, { useEffect, useRef, useState } from "react";
import Chessboard from "chessboardjsx";
import Chess from "chess.js";

/*
  ChessGame: Supports:
  - local 2-player on same device
  - single-player vs AI (minimax with alpha-beta)
  - theme toggle (dark / light), undo, new game, move history
*/

const PIECE_THEME =
  "https://images.chesscomfiles.com/chess-themes/pieces/neo/150/{piece}.png";

const DEFAULT_AI_DEPTH = 3; // increase for stronger AI (slower)

const pieceValue = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

function evaluateBoard(game) {
  // simple material evaluation: sum of piece values
  const board = game.board();
  let total = 0;
  for (let row of board) {
    for (let square of row) {
      if (square) {
        const val = pieceValue[square.type];
        total += square.color === "w" ? val : -val;
      }
    }
  }
  return total;
}

function minimaxRoot(game, depth, isMaximizingPlayer) {
  const possibleMoves = game.moves({ verbose: true });
  let bestMove = null;
  let bestValue = isMaximizingPlayer ? -Infinity : Infinity;

  for (let i = 0; i < possibleMoves.length; i++) {
    const move = possibleMoves[i];
    game.move({ from: move.from, to: move.to, promotion: "q" });
    const value = minimax(game, depth - 1, -Infinity, Infinity, !isMaximizingPlayer);
    game.undo();
    if (isMaximizingPlayer) {
      if (value > bestValue) {
        bestValue = value;
        bestMove = move;
      }
    } else {
      if (value < bestValue) {
        bestValue = value;
        bestMove = move;
      }
    }
  }
  return bestMove;
}

function minimax(game, depth, alpha, beta, isMaximizingPlayer) {
  if (depth === 0 || game.game_over()) {
    return evaluateBoard(game);
  }

  const moves = game.moves({ verbose: true });

  if (isMaximizingPlayer) {
    let maxEval = -Infinity;
    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      game.move({ from: move.from, to: move.to, promotion: "q" });
      const evalScore = minimax(game, depth - 1, alpha, beta, false);
      game.undo();
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) {
        break;
      }
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      game.move({ from: move.from, to: move.to, promotion: "q" });
      const evalScore = minimax(game, depth - 1, alpha, beta, true);
      game.undo();
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) {
        break;
      }
    }
    return minEval;
  }
}

export default function ChessGame() {
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState("start");
  const [orientation, setOrientation] = useState("white");
  const [gameMode, setGameMode] = useState("local"); // 'local' or 'ai'
  const [aiDepth, setAiDepth] = useState(DEFAULT_AI_DEPTH);
  const [isThinking, setIsThinking] = useState(false);
  const [history, setHistory] = useState([]);
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    // If AI plays white and gameMode is ai and AI's turn, make AI move
    const game = gameRef.current;
    const isAiTurn =
      gameMode === "ai" &&
      ((orientation === "white" && game.turn() === "b") ||
        (orientation === "black" && game.turn() === "w"));
    if (isAiTurn && !game.game_over()) {
      window.setTimeout(() => aiMove(), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameMode, orientation]);

  function safeSetFen(nextFen) {
    setFen(nextFen);
    setHistory((h) => gameRef.current.history({ verbose: true }));
  }

  function onDrop({ sourceSquare, targetSquare, piece }) {
    const game = gameRef.current;

    // Prevent move when game over or AI thinking
    if (game.game_over() || isThinking) return;

    // If single-player and it's not player's turn, ignore drop
    if (gameMode === "ai") {
      const playerColor = orientation === "white" ? "w" : "b";
      if (game.turn() !== playerColor) return;
    }

    const move = game.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: "q",
    });

    if (move === null) return;

    safeSetFen(game.fen());

    // After player's move, if AI mode and not game over, trigger AI
    if (gameMode === "ai" && !game.game_over()) {
      window.setTimeout(() => aiMove(), 250);
    }
  }

  function aiMove() {
    const game = gameRef.current;
    setIsThinking(true);

    // Decide whether AI should maximize (white) or minimize (black)
    const aiIsWhite = !(orientation === "white");
    const isMaximizing = aiIsWhite;

    // Run minimax on a copy of the game (we use the actual game but undo each move)
    try {
      const best = minimaxRoot(game, aiDepth, isMaximizing);
      if (best) {
        game.move({ from: best.from, to: best.to, promotion: "q" });
        safeSetFen(game.fen());
      }
    } catch (err) {
      console.error("AI error:", err);
      // fallback: make a random legal move
      const moves = game.moves({ verbose: true });
      if (moves.length > 0) {
        const mv = moves[Math.floor(Math.random() * moves.length)];
        game.move({ from: mv.from, to: mv.to, promotion: "q" });
        safeSetFen(game.fen());
      }
    } finally {
      setIsThinking(false);
    }
  }

  function newGame() {
    gameRef.current = new Chess();
    setFen("start");
    setHistory([]);
  }

  function undo() {
    const game = gameRef.current;
    if (game.history().length === 0) return;

    // If AI mode, undo last two plies to return to player's turn
    if (gameMode === "ai") {
      game.undo();
      if (game.history().length > 0) game.undo();
    } else {
      game.undo();
    }
    setFen(game.fen() || "start");
    setHistory(game.history({ verbose: true }));
  }

  function handleModeChange(mode) {
    newGame();
    setGameMode(mode);
    // default orientation: if vs AI, player plays white; user can toggle
    setOrientation("white");
    setIsThinking(false);
  }

  function toggleOrientation() {
    setOrientation((o) => (o === "white" ? "black" : "white"));
  }

  function toggleTheme() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  const game = gameRef.current;
  const status = (() => {
    if (game.in_checkmate()) {
      return `Checkmate. ${game.turn() === "w" ? "Black" : "White"} wins.`;
    } else if (game.in_draw()) {
      return "Draw.";
    } else if (game.in_check()) {
      return `${game.turn() === "w" ? "White" : "Black"} to move — Check!`;
    } else {
      return `${game.turn() === "w" ? "White" : "Black"} to move.`;
    }
  })();

  return (
    <div className={`container ${theme}`}>
      <div className="header">
        <div className="title">
          <span className="logo">Chess</span>
          <span className="pro">Pro</span>
        </div>
        <div className="controls">
          <button
            className={`mode-btn ${gameMode === "local" ? "active" : ""}`}
            onClick={() => handleModeChange("local")}
            title="2-player (same device)"
          >
            2-Player
          </button>
          <button
            className={`mode-btn ${gameMode === "ai" ? "active" : ""}`}
            onClick={() => handleModeChange("ai")}
            title="Play vs AI"
          >
            vs AI
          </button>

          <select
            value={aiDepth}
            onChange={(e) => setAiDepth(parseInt(e.target.value))}
            disabled={gameMode !== "ai" || isThinking}
            title="AI strength (higher = stronger, slower)"
          >
            <option value={1}>AI: Easy</option>
            <option value={2}>AI: Normal</option>
            <option value={3}>AI: Hard</option>
            <option value={4}>AI: Very Hard</option>
          </select>

          <button onClick={toggleOrientation} title="Flip board">
            Flip
          </button>
          <button onClick={toggleTheme} title="Toggle theme">
            Theme
          </button>
          <button onClick={undo} title="Undo last move(s)">
            Undo
          </button>
          <button onClick={newGame} title="Start new game">
            New Game
          </button>
        </div>
      </div>

      <div className="main">
        <div className="board-wrap">
          <Chessboard
            width={520}
            position={fen}
            onDrop={onDrop}
            orientation={orientation}
            showNotation={true}
            transitionDuration={250}
            customBoardStyle={{
              borderRadius: "12px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
            }}
            pieceStyle={{
              filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.6))",
            }}
            squareStyles={{}}
            draggable={true}
            boardStyle={{ background: "transparent" }}
            darkSquareStyle={{ backgroundColor: theme === "dark" ? "#729583" : "#B58863" }}
            lightSquareStyle={{ backgroundColor: theme === "dark" ? "#f0d9b5" : "#F0D9B5" }}
            pieceTheme={PIECE_THEME}
          />
          <div className="status">
            <div>{status}</div>
            {isThinking && <div className="thinking">AI is thinking...</div>}
          </div>
        </div>

        <div className="sidepanel">
          <div className="panel-section">
            <h3>Move History</h3>
            <div className="history">
              {history.length === 0 && <div className="muted">No moves yet</div>}
              {history.map((m, i) => (
                <div key={i} className="mv">
                  {i + 1}. {m.san}
                </div>
              ))}
            </div>
          </div>

          <div className="panel-section">
            <h3>Captured</h3>
            <CapturedList game={game} />
          </div>

          <div className="panel-section">
            <h3>Tips</h3>
            <ul className="tips">
              <li>Drag pieces to move.</li>
              <li>In vs AI mode, player plays White by default.</li>
              <li>Use Flip to change orientation for Black.</li>
            </ul>
          </div>
        </div>
      </div>

      <footer className="footer">
        Built with ❤️ — Copy to your repo and run <code>npm install</code>, <code>npm run dev</code>
      </footer>
    </div>
  );
}

function CapturedList({ game }) {
  // compute captured pieces by comparing starting pieces to current board
  const initial = [
    "r",
    "n",
    "b",
    "q",
    "k",
    "b",
    "n",
    "r",
    "p",
    "p",
    "p",
    "p",
    "p",
    "p",
    "p",
    "p",
  ];
  const board = game.board().flat().filter(Boolean);
  const counts = { w: {}, b: {} };
  for (let sq of board) {
    counts[sq.color][sq.type] = (counts[sq.color][sq.type] || 0) + 1;
  }
  // initial counts
  const initCounts = { w: { p: 8, r: 2, n: 2, b: 2, q: 1, k: 1 }, b: { p: 8, r: 2, n: 2, b: 2, q: 1, k: 1 } };
  const captured = { w: [], b: [] };
  for (let color of ["w", "b"]) {
    for (let piece of ["p", "r", "n", "b", "q", "k"]) {
      const before = initCounts[color][piece] || 0;
      const now = counts[color][piece] || 0;
      const lost = before - now;
      for (let i = 0; i < lost; i++) {
        captured[color].push(piece);
      }
    }
  }

  return (
    <div className="captured">
      <div>
        <strong>White lost:</strong>{" "}
        {captured.w.length === 0 ? <span className="muted">—</span> : captured.w.map((p, i) => renderPieceImg("w", p, i))}
      </div>
      <div style={{ marginTop: 8 }}>
        <strong>Black lost:</strong>{" "}
        {captured.b.length === 0 ? <span className="muted">—</span> : captured.b.map((p, i) => renderPieceImg("b", p, i))}
      </div>
    </div>
  );
}

function renderPieceImg(color, piece, key) {
  const src = PIECE_THEME.replace("{piece}", `${color}${piece.toUpperCase()}`);
  return <img key={key} src={src} alt={`${color}${piece}`} style={{ width: 26, marginRight: 6 }} />;
}
