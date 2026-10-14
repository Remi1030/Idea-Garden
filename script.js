const STORAGE_KEY = 'idea-garden-workspace-v2';
const canvas = document.getElementById('sketch-layer');
const context = canvas.getContext('2d');
const app = document.querySelector('.app-shell');
const tabList = document.getElementById('board-tab-list');
const toolButtons = document.querySelectorAll('[data-tool]');
const colorButtons = document.querySelectorAll('[data-color]');

const brushSettings = {
  pen: { width: 2.2, alpha: 0.9, composite: 'source-over' },
  pencil: { width: 1.2, alpha: 0.48, composite: 'source-over' },
  marker: { width: 7, alpha: 0.45, composite: 'source-over' },
  highlighter: { width: 17, alpha: 0.27, composite: 'source-over' },
  eraser: { width: 25, alpha: 1, composite: 'destination-out' }
};

let workspace = loadWorkspace();
let activeTool = 'pen';
let activeColor = '#26312d';
let isDrawing = false;
let currentStroke = null;
let highestZ = 5;

function createBoard(name = 'Ideas') {
  return { id: `board-${Date.now()}-${Math.random().toString(16).slice(2)}`, name, strokes: [], redo: [], notes: [] };
}

function loadWorkspace() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.boards?.length) return saved;
  } catch (error) {
    console.warn('Could not load the saved Idea Garden workspace.', error);
  }
  const firstBoard = createBoard('Ideas');
  return { boards: [firstBoard], activeId: firstBoard.id };
}

function activeBoard() {
  return workspace.boards.find((board) => board.id === workspace.activeId) || workspace.boards[0];
}

function persistWorkspace() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}

function setStatus() {}

function renderTabs() {
  tabList.innerHTML = '';
  workspace.boards.forEach((board) => {
    const tab = document.createElement('div');
    tab.className = `board-tab${board.id === workspace.activeId ? ' active' : ''}`;
    tab.dataset.boardId = board.id;
    tab.innerHTML = `<span class="tab-number">${String(workspace.boards.indexOf(board) + 1).padStart(2, '0')}</span><span class="tab-name" contenteditable="true" spellcheck="false"></span><button class="tab-close" aria-label="Remove ${board.name}" title="Remove board">×</button>`;
    const name = tab.querySelector('.tab-name');
    const close = tab.querySelector('.tab-close');
    name.textContent = board.name;
    name.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        name.blur();
      }
    });
    name.addEventListener('input', () => {
      board.name = name.textContent.trim() || 'Untitled board';
      persistWorkspace();
    });
    name.addEventListener('blur', () => {
      name.textContent = board.name;
      close.setAttribute('aria-label', `Remove ${board.name}`);
      persistWorkspace();
    });
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      removeBoard(board.id);
    });
    tab.addEventListener('click', () => switchBoard(board.id));
    tabList.appendChild(tab);
  });
}

function switchBoard(boardId) {
  if (workspace.activeId === boardId) return;
  workspace.activeId = boardId;
  renderTabs();
  renderActiveBoard();
  persistWorkspace();
}

function addBoard() {
  const board = createBoard(`Board ${workspace.boards.length + 1}`);
  workspace.boards.push(board);
  workspace.activeId = board.id;
  renderTabs();
  renderActiveBoard();
  persistWorkspace();
  setStatus('New board added');
  const activeName = document.querySelector('.board-tab.active .tab-name');
  activeName?.focus();
  document.getSelection()?.selectAllChildren(activeName);
}

function removeBoard(boardId) {
  const boardIndex = workspace.boards.findIndex((board) => board.id === boardId);
  if (boardIndex === -1) return;

  if (workspace.boards.length === 1) {
    const freshBoard = createBoard('Ideas');
    workspace.boards = [freshBoard];
    workspace.activeId = freshBoard.id;
  } else {
    workspace.boards.splice(boardIndex, 1);
    if (workspace.activeId === boardId) {
      workspace.activeId = workspace.boards[Math.max(0, boardIndex - 1)].id;
    }
  }

  renderTabs();
  renderActiveBoard();
  persistWorkspace();
  setStatus('Board removed');
}

document.getElementById('add-board').addEventListener('click', addBoard);

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const rect = app.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  redrawStrokes();
}

function getPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height };
}

function configureBrush(stroke) {
  const settings = brushSettings[stroke.tool];
  const scale = Math.min(canvas.clientWidth / 1280, canvas.clientHeight / 720);
  context.lineWidth = settings.width * Math.max(scale, .75);
  context.globalAlpha = settings.alpha;
  context.globalCompositeOperation = settings.composite;
  context.strokeStyle = stroke.color;
}

function drawStroke(stroke) {
  if (!stroke.points.length) return;
  configureBrush(stroke);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  context.beginPath();
  context.moveTo(stroke.points[0].x * width, stroke.points[0].y * height);
  stroke.points.slice(1).forEach((point) => context.lineTo(point.x * width, point.y * height));
  context.stroke();
}

function redrawStrokes() {
  if (!canvas.clientWidth) return;
  context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  activeBoard().strokes.forEach(drawStroke);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  updateHistoryButtons();
}

function beginStroke(event) {
  if (event.button !== undefined && event.button !== 0) return;
  isDrawing = true;
  currentStroke = { tool: activeTool, color: activeColor, points: [getPoint(event)] };
  canvas.setPointerCapture(event.pointerId);
}

function continueStroke(event) {
  if (!isDrawing) return;
  currentStroke.points.push(getPoint(event));
  context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  activeBoard().strokes.forEach(drawStroke);
  drawStroke(currentStroke);
}

function endStroke() {
  if (!isDrawing) return;
  isDrawing = false;
  if (currentStroke.points.length > 1) {
    activeBoard().strokes.push(currentStroke);
    activeBoard().redo = [];
    persistWorkspace();
    setStatus('Stroke saved');
  }
  currentStroke = null;
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  updateHistoryButtons();
}

canvas.addEventListener('pointerdown', beginStroke);
canvas.addEventListener('pointermove', continueStroke);
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);
window.addEventListener('resize', resizeCanvas);

toolButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activeTool = button.dataset.tool;
    toolButtons.forEach((item) => item.classList.toggle('active', item === button));
    canvas.style.cursor = activeTool === 'eraser' ? 'cell' : 'crosshair';
  });
});

colorButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activeColor = button.dataset.color;
    colorButtons.forEach((item) => item.classList.toggle('active', item === button));
    if (activeTool === 'eraser') {
      activeTool = 'pen';
      toolButtons.forEach((item) => item.classList.toggle('active', item.dataset.tool === activeTool));
    }
  });
});

function updateHistoryButtons() {
  document.getElementById('undo').disabled = activeBoard().strokes.length === 0;
  document.getElementById('redo').disabled = activeBoard().redo.length === 0;
  document.getElementById('remove-stroke').disabled = activeBoard().strokes.length === 0;
}

function undoStroke() {
  const board = activeBoard();
  if (!board.strokes.length) return setStatus('Nothing to undo');
  board.redo.push(board.strokes.pop());
  redrawStrokes();
  persistWorkspace();
  setStatus('Stroke undone');
}

function redoStroke() {
  const board = activeBoard();
  if (!board.redo.length) return setStatus('Nothing to redo');
  board.strokes.push(board.redo.pop());
  redrawStrokes();
  persistWorkspace();
  setStatus('Stroke redone');
}

function removeLastStroke() {
  const board = activeBoard();
  if (!board.strokes.length) return setStatus('Nothing to remove');
  board.strokes.pop();
  board.redo = [];
  redrawStrokes();
  persistWorkspace();
  setStatus('Last stroke removed');
}

document.getElementById('undo').addEventListener('click', undoStroke);
document.getElementById('redo').addEventListener('click', redoStroke);
document.getElementById('remove-stroke').addEventListener('click', removeLastStroke);

function noteMarkup(note) {
  return `<div class="pin"></div>
    <button class="delete-note" aria-label="Delete note">×</button>
    <div class="note-label">${note.label || 'new / thought'}</div>
    <div class="note-content" contenteditable="true" spellcheck="true"></div>
    <div class="note-footer">let it wander <span>↗</span></div>`;
}

function makeNote(x = .55, y = .36) {
  const board = activeBoard();
  const tone = ['note-sun', 'note-coral', 'note-cream'][board.notes.length % 3];
  const note = { id: `note-${Date.now()}`, tone, label: 'new / thought', text: 'Start writing...', x, y, rotation: Math.round(Math.random() * 6 - 3) };
  board.notes.push(note);
  renderNotes();
  persistWorkspace();
  const element = document.querySelector(`[data-note-id="${note.id}"]`);
  element.querySelector('.note-content').focus();
  document.getSelection().selectAllChildren(element.querySelector('.note-content'));
  setStatus('New thought added');
}

document.getElementById('add-note').addEventListener('click', () => makeNote(.45 + Math.random() * .23, .28 + Math.random() * .32));

function bindNote(element, note) {
  const content = element.querySelector('.note-content');
  const remove = element.querySelector('.delete-note');
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;
  content.textContent = note.text;

  element.addEventListener('pointerdown', (event) => {
    if (event.target === content || event.target === remove) return;
    dragging = true;
    element.classList.add('dragging');
    element.style.zIndex = ++highestZ;
    const rect = element.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    element.setPointerCapture(event.pointerId);
  });

  element.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const boardRect = app.getBoundingClientRect();
    const left = Math.max(95, Math.min(boardRect.width - element.offsetWidth - 20, event.clientX - boardRect.left - offsetX));
    const top = Math.max(105, Math.min(boardRect.height - element.offsetHeight - 20, event.clientY - boardRect.top - offsetY));
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.transform = 'rotate(0deg)';
    note.x = left / boardRect.width;
    note.y = top / boardRect.height;
    note.rotation = 0;
  });

  const finishDrag = () => {
    if (!dragging) return;
    dragging = false;
    element.classList.remove('dragging');
    persistWorkspace();
    setStatus('Thought moved');
  };
  element.addEventListener('pointerup', finishDrag);
  element.addEventListener('pointercancel', finishDrag);
  remove.addEventListener('click', () => {
    const board = activeBoard();
    board.notes = board.notes.filter((item) => item.id !== note.id);
    element.remove();
    persistWorkspace();
    setStatus('Thought removed');
  });
  content.addEventListener('input', () => {
    note.text = content.innerText;
    persistWorkspace();
    setStatus('Saving…');
  });
  content.addEventListener('blur', () => {
    note.text = content.innerText.trim() || 'Start writing...';
    content.textContent = note.text;
    persistWorkspace();
  });
}

function renderNotes() {
  document.querySelectorAll('.board-note').forEach((note) => note.remove());
  activeBoard().notes.forEach((note) => {
    const element = document.createElement('div');
    const tone = ['note-sun', 'note-coral', 'note-cream'].includes(note.tone) ? note.tone : 'note-cream';
    element.className = `board-note ${tone}`;
    element.dataset.noteId = note.id;
    element.style.left = `${note.x * 100}%`;
    element.style.top = `${note.y * 100}%`;
    element.style.transform = `rotate(${note.rotation || 0}deg)`;
    element.innerHTML = noteMarkup(note);
    app.appendChild(element);
    bindNote(element, note);
  });
}

function renderActiveBoard() {
  renderNotes();
  redrawStrokes();
}

renderTabs();
renderActiveBoard();
resizeCanvas();
