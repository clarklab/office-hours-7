/**
 * OFFICE HOURS — the set.
 *
 * One continuous floor plan for MULCH, Inc., eleven days from running out of
 * money. All four rooms are built at once so the camera can cut between them
 * and actors can walk from reception to the meeting room without a load screen.
 *
 * ```
 *        x -13 ......... -5.9 ........... 5.9 .......... 13
 *  z=-6.6  +-------------+--WINDOW WALL---+--------------+
 *          |             |                |  BREAK ROOM  |
 *          |  RECEPTION  |    BULLPEN     |   (x~9,z~-4) |
 *  z= 0.2  |   ==DOOR==  |                +--------------+
 *  z= 2.0  +-------------+                |  MEETING RM  |
 *          |        HALLWAY / BACK        |   (x~9,z~4)  |
 *  z= 7.2  +------------------------------+--------------+
 * ```
 *
 * Lighting is EXACTLY four `PointLight`s plus one `AmbientLight` — that is the
 * hard cap the PS1 Gouraud shader supports (see `core/ps1.js`). Adding a fifth
 * silently drops someone else's light, so don't.
 *
 * @module sets/office
 */

import * as THREE from 'three';
import { ps1Material } from '/js/core/ps1.js';
import * as P from '/js/sets/props.js';

/* ------------------------------------------------------------- dimensions */

/** Inside faces of the exterior shell, in metres. @type {Object<string, number>} */
export const BOUNDS = {
  minX: -13,
  maxX: 13,
  minZ: -6.6,
  maxZ: 7.2,
  ceil: 2.75,
};

/** x of the reception / bullpen divider. */
const DIV_A = -5.9;
/** x of the bullpen / break+meeting divider. */
const DIV_B = 5.9;
/** z of the break / meeting divider. */
const DIV_C = 0.2;
/** z of the reception / hallway divider. */
const DIV_E = 2.0;
/** Wall thickness for interior partitions. */
const WT = 0.16;
/** Wall thickness for the exterior shell. */
const XT = 0.2;

/** Desk row A (backs to the window, faces +Z). */
const ROW_A_DESK_Z = -3.5;
/** Desk row B (faces -Z, back to the room). */
const ROW_B_DESK_Z = -2.5;

/* ------------------------------------------------------------------ utils */

/**
 * @param {number} x @param {number} z
 * @returns {THREE.Vector3} a floor mark
 */
function mark(x, z) {
  return new THREE.Vector3(x, 0, z);
}

/**
 * @param {number} px @param {number} py @param {number} pz
 * @param {number} lx @param {number} ly @param {number} lz
 * @param {number} [fov]
 * @returns {{pos:number[], look:number[], fov?:number}}
 */
function shot(px, py, pz, lx, ly, lz, fov) {
  const s = { pos: [px, py, pz], look: [lx, ly, lz] };
  if (fov) s.fov = fov;
  return s;
}

/**
 * Places a prop and adds it to a parent.
 * @param {THREE.Object3D} parent
 * @param {THREE.Object3D} obj
 * @param {number} x @param {number} y @param {number} z
 * @param {number} [ry=0] yaw in radians
 * @returns {THREE.Object3D} the prop, for chaining
 */
function put(parent, obj, x, y, z, ry = 0) {
  obj.position.set(x, y, z);
  obj.rotation.y = ry;
  parent.add(obj);
  return obj;
}

/* ------------------------------------------------------------------- set  */

/**
 * @typedef {Object} OfficeSet
 * @property {THREE.Group} group everything; add this to the stage scene
 * @property {Object<string, THREE.Vector3>} marks named floor positions for actors
 * @property {Object<string, {pos:number[], look:number[], fov?:number}>} shots named camera setups
 * @property {Object<string, THREE.Object3D>} props named prop handles
 * @property {(dt:number, t:number)=>void} update per-frame: flicker, CRTs, clock, HVAC
 * @property {(room:('bullpen'|'break'|'meeting'|'reception'|'hallway'|'all'|null))=>void} focusRoom
 * @property {{ambient:THREE.AmbientLight, points:THREE.PointLight[]}} lights additive
 * @property {()=>void} dispose additive
 */

/**
 * Builds the MULCH, Inc. office.
 *
 * Nothing is parented to a scene — add `set.group` yourself, and drive
 * `set.update` from `stage.onUpdate`.
 *
 * @returns {OfficeSet}
 */
export function createOffice() {
  const group = new THREE.Group();
  group.name = 'office';

  /** @type {Object<string, THREE.Object3D>} */
  const props = {};
  /** CRT monitors the update loop scrolls. @type {THREE.Group[]} */
  const monitors = [];
  /** Things that sway on the HVAC. @type {{o:THREE.Object3D, a:number, f:number, p:number}[]} */
  const swayers = [];

  /* ------------------------------------------------------------ envelope */

  const W = BOUNDS.maxX - BOUNDS.minX;
  const D = BOUNDS.maxZ - BOUNDS.minZ;
  const CZ = (BOUNDS.minZ + BOUNDS.maxZ) / 2;

  const floor = P.floorTiles({ w: W, d: D, repeat: 0.9, segs: 16 });
  floor.position.set(0, 0, CZ);
  group.add(floor);

  // drop ceiling
  const ceilGeo = new THREE.PlaneGeometry(W, D, 12, 7);
  const cuv = ceilGeo.attributes.uv;
  for (let i = 0; i < cuv.count; i++) cuv.setXY(i, cuv.getX(i) * W * 0.85, cuv.getY(i) * D * 0.85);
  cuv.needsUpdate = true;
  const ceiling = new THREE.Mesh(ceilGeo, ps1Material({ map: P.ceilingTexture(), color: 0xffffff, jitter: 0.9 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, BOUNDS.ceil, CZ);
  group.add(ceiling);

  /**
   * Adds a wall running along X.
   * @param {number} cx @param {number} cz @param {number} w
   * @param {Object} [o] forwarded to {@link P.wallSegment}
   * @returns {THREE.Group}
   */
  function wallX(cx, cz, w, o = {}) {
    const s = P.wallSegment(Object.assign({ w, h: BOUNDS.ceil }, o));
    return /** @type {THREE.Group} */ (put(group, s, cx, 0, cz));
  }

  /**
   * Adds a wall running along Z.
   * @param {number} cx @param {number} cz @param {number} len
   * @param {Object} [o]
   * @returns {THREE.Group}
   */
  function wallZ(cx, cz, len, o = {}) {
    const s = P.wallSegment(Object.assign({ w: len, h: BOUNDS.ceil }, o));
    return /** @type {THREE.Group} */ (put(group, s, cx, 0, cz, Math.PI / 2));
  }

  // exterior shell
  wallX(-8.9, BOUNDS.minZ - XT / 2, 8.2, { t: XT });
  wallX(8.9, BOUNDS.minZ - XT / 2, 8.2, { t: XT });
  wallX(0, BOUNDS.maxZ + XT / 2, W + XT * 2, { t: XT });
  wallZ(BOUNDS.minX - XT / 2, CZ, D + XT * 2, { t: XT });
  wallZ(BOUNDS.maxX + XT / 2, CZ, D + XT * 2, { t: XT });

  // window wall + the pre-rendered view beyond it
  const win = P.windowWall({ w: 9.6, h: BOUNDS.ceil, bays: 4 });
  put(group, win, 0, 0, BOUNDS.minZ - 0.08, Math.PI);
  props.windowWall = win;
  const city = P.cityscapeBackdrop({ w: 30, h: 15 });
  put(group, city, 0, 2.6, BOUNDS.minZ - 10.5);
  props.cityscape = city;

  // reception / bullpen divider, with the doorway
  wallZ(DIV_A, -3.85, 5.5, { t: WT });
  wallZ(DIV_A, 1.45, 1.1, { t: WT });
  put(group, P.doorway({ width: 2, height: 2.1, thickness: WT, ceil: BOUNDS.ceil }),
    DIV_A, 0, -0.1, Math.PI / 2);

  // reception / hallway divider
  wallX(-9.45, DIV_E, 7.3, { t: WT });

  // bullpen / break+meeting divider, two doorways
  wallZ(DIV_B, -4.6, 4.0, { t: WT });
  wallZ(DIV_B, 1.0, 3.2, { t: WT });
  wallZ(DIV_B, 5.9, 2.6, { t: WT });
  put(group, P.doorway({ width: 2, height: 2.1, thickness: WT, ceil: BOUNDS.ceil }),
    DIV_B, 0, -1.6, Math.PI / 2);
  put(group, P.doorway({ width: 2, height: 2.1, thickness: WT, ceil: BOUNDS.ceil }),
    DIV_B, 0, 3.6, Math.PI / 2);

  // break / meeting divider
  wallX(9.45, DIV_C, 7.2, { t: WT });

  /* ----------------------------------------------------------- reception */

  // counter: 2.2m along Z, front face toward +X
  const recDesk = new THREE.Group();
  recDesk.add(P.boxMesh(0.75, 0.72, 2.2, { color: P.PALETTE.deskTop, jitter: 0.9 }, 0, 0.36, 0));
  recDesk.add(P.boxMesh(0.9, 0.06, 2.35, { color: P.PALETTE.deskEdge, jitter: 0.9 }, 0.04, 1.11, 0));
  recDesk.add(P.boxMesh(0.06, 0.4, 2.3, { color: P.PALETTE.beigeDark, jitter: 0.9 }, 0.4, 0.88, 0));
  put(group, recDesk, -11.2, 0, -2.4);
  props.receptionDesk = recDesk;

  const recPhone = P.deskPhone();
  put(group, recPhone, -11.3, 0.74, -1.9, Math.PI / 2);
  props.deskPhone = recPhone;
  put(group, P.bankersBoxStack({ count: 1 }), -11.35, 0.74, -3.05, 0.4);

  const logo = P.mulchLogoWall({ w: 2.6, h: 1.3, y: 1.78 });
  put(group, logo, BOUNDS.minX + 0.03, 0, -2.4, Math.PI / 2);
  props.logoWall = logo;
  props.mulchLogo = logo;

  const clock = P.wallClock({ r: 0.19 });
  put(group, clock, BOUNDS.minX + 0.04, 2.1, -5.2, Math.PI / 2);
  props.clock = clock;

  // three waiting chairs. Two more than anyone has needed in months.
  for (let i = 0; i < 3; i++) {
    const c = P.officeChair({ color: P.PALETTE.fabricWorn });
    put(group, c, -11.0 + i * 1.15, 0, 1.45, Math.PI + (i - 1) * 0.16);
  }
  const sadPlant = P.pottedPlant({ dead: false, scale: 1.05 });
  put(group, sadPlant, -12.4, 0, 1.3);
  props.plant = sadPlant;
  swayers.push({ o: sadPlant.userData.fronds, a: 0.035, f: 0.33, p: 0 });

  // the role nobody filled, with every tab still attached
  const hiring = P.poster('NOW\nHIRING', {
    w: 0.46, h: 0.64, sub: 'HEAD OF GROWTH', accent: '#2f7d5e', tearStrip: true, size: 12,
  });
  put(group, hiring, DIV_A - WT / 2 - 0.012, 1.65, -4.4, -Math.PI / 2);
  props.hiringPoster = hiring;

  put(group, P.motivationalPoster({ word: 'PATIENCE', caption: 'it compounds' }),
    BOUNDS.minX + 0.03, 1.6, 0.6, Math.PI / 2);

  /* ------------------------------------------------------------- bullpen */

  /** @type {Array<{x:number, z:number, row:'a'|'b', key:string, seed:number}>} */
  const stations = [
    { x: -3.3, z: ROW_A_DESK_Z, row: 'a', key: 'Brad', seed: 1 },
    { x: 0.0, z: ROW_A_DESK_Z, row: 'a', key: 'Dez', seed: 2 },
    { x: 3.3, z: ROW_A_DESK_Z, row: 'a', key: 'Marge', seed: 3 },
    { x: -1.65, z: ROW_B_DESK_Z, row: 'b', key: 'Roop', seed: 4 },
    { x: 1.65, z: ROW_B_DESK_Z, row: 'b', key: 'Empty', seed: 5 },
  ];

  for (const st of stations) {
    const faceA = st.row === 'a';
    // Row A users sit at -Z of their desk and look +Z; row B is mirrored.
    const userDir = faceA ? 1 : -1;
    const deskYaw = faceA ? 0 : Math.PI;
    put(group, P.desk({ w: 1.5, d: 0.8, pedestal: faceA ? 'left' : 'right' }), st.x, 0, st.z, deskYaw);

    const crt = P.crtMonitor({ seed: st.seed });
    // monitor sits at the back of the desk, screen toward the user
    put(group, crt, st.x - 0.08, 0.74, st.z - userDir * 0.24, faceA ? Math.PI : 0);
    monitors.push(crt);
    props[`monitor${st.key}`] = crt;

    put(group, P.keyboard(), st.x - 0.02, 0.755, st.z + userDir * 0.26, faceA ? Math.PI : 0);

    const chair = P.officeChair({ arms: st.key === 'Brad' });
    // chairs are never tucked in, which is also what keeps the marks clear
    put(group, chair, st.x + (st.key === 'Empty' ? 0.3 : 0.02), 0,
      st.z + userDir * (faceA ? 1.65 : 1.4),
      (faceA ? 0 : Math.PI) + (st.key === 'Empty' ? 0.9 : (st.seed % 3) * 0.14 - 0.14));
  }

  // the dead-centre partition the two rows share, plus stubby end returns
  put(group, P.cubiclePartition({ w: 9.4, h: 1.06 }), 0, 0, -3.0);
  put(group, P.cubiclePartition({ w: 1.1, h: 1.06 }), 4.72, 0, -3.5, Math.PI / 2);
  put(group, P.cubiclePartition({ w: 1.1, h: 1.06 }), -4.72, 0, -3.5, Math.PI / 2);
  put(group, P.cubiclePartition({ w: 1.5, h: 1.06 }), -2.5, 0, -1.9, Math.PI / 2);
  put(group, P.cubiclePartition({ w: 1.5, h: 1.06 }), 2.5, 0, -1.9, Math.PI / 2);

  // desk clutter: the empty station never got unpacked
  put(group, P.bankersBoxStack({ count: 2 }), 1.55, 0.74, -2.5, 0.2);
  put(group, P.deskPhone({ color: P.PALETTE.beigeDark }), -0.62, 0.755, -3.28, Math.PI);

  const board = P.whiteboard({ w: 1.8, h: 1.1, map: P.burnChartTexture() });
  put(group, board, -4.55, 0, 1.95, Math.PI / 2 - 0.9);
  props.whiteboard = board;

  const cooler = P.waterCooler();
  put(group, cooler, 5.45, 0, 1.4, -Math.PI / 2);
  props.waterCooler = cooler;
  swayers.push({ o: cooler.userData.bottle, a: 0.012, f: 0.9, p: 1.1 });

  const deadPlant = P.pottedPlant({ dead: true, scale: 0.95 });
  put(group, deadPlant, 5.2, 0, -5.9);
  props.deadPlant = deadPlant;
  swayers.push({ o: deadPlant.userData.fronds, a: 0.02, f: 0.27, p: 2.2 });

  /* ----------------------------------------------------- hallway / back  */

  const copy = P.copier();
  put(group, copy, -4.6, 0, 5.95, Math.PI);
  props.copier = copy;

  put(group, P.bankersBoxStack({ count: 4, lids: false }), -0.5, 0, 5.95, -0.2);
  const boxes = P.bankersBoxStack({ count: 3, lids: false });
  put(group, boxes, 0.9, 0, 6.3, 0.35);
  props.boxes = boxes;
  put(group, P.bankersBoxStack({ count: 2, lids: false }), -6.6, 0, 6.2, 0.6);

  // two more chairs nobody sits in
  put(group, P.officeChair({ color: P.PALETTE.fabricWorn }), -2.9, 0, 5.4, 2.4);
  put(group, P.officeChair({ color: P.PALETTE.fabricWorn }), 3.4, 0, 5.9, -1.1);

  put(group, P.poster('FIRE\nEXIT', { w: 0.3, h: 0.4, accent: '#8c3a30', size: 10 }),
    2.6, 1.9, BOUNDS.maxZ - 0.01, Math.PI);

  /* ---------------------------------------------------------- break room */

  const bx = 9.45;
  const cnt = P.counter({ w: 4.4, d: 0.6, h: 0.9, sink: true, sinkX: 1.35 });
  put(group, cnt, 8.9, 0, BOUNDS.minZ + 0.31);
  props.counter = cnt;

  const mw = P.microwave();
  put(group, mw, 7.4, 0.9, BOUNDS.minZ + 0.33);
  props.microwave = mw;
  const coffee = P.coffeeMachine();
  put(group, coffee, 8.7, 0.9, BOUNDS.minZ + 0.33);
  props.coffeeMachine = coffee;

  const fr = P.fridge();
  put(group, fr, BOUNDS.maxX - 0.36, 0, -5.85, -Math.PI / 2);
  props.fridge = fr;

  const rt = P.roundTable({ r: 0.72 });
  put(group, rt, bx - 0.05, 0, -3.0);
  props.roundTable = rt;
  const speaker = P.speakerphone({ r: 0.09 });
  put(group, speaker, bx - 0.05, 0.74, -3.0, 0.3);
  props.breakSpeakerphone = speaker;

  const breakSeats = [
    [8.58, -2.53, -2.2],
    [9.40, -3.95, 0.0],
    [10.22, -2.53, 2.2],
  ];
  for (const [cx, cz, yaw] of breakSeats) {
    put(group, P.officeChair({ color: P.PALETTE.fabricWorn }), cx, 0, cz, yaw);
  }

  const vend = P.vendingMachine();
  put(group, vend, 11.6, 0, DIV_C - WT / 2 - 0.37, Math.PI);
  props.vending = vend;
  props.vendingMachine = vend;

  const label = P.poster('LABEL\nYOUR\nFOOD', {
    w: 0.42, h: 0.58, accent: '#b98a3a', sub: 'THIS MEANS YOU', size: 11,
  });
  put(group, label, 10.2, 1.78, BOUNDS.minZ + 0.02);
  props.labelPoster = label;
  put(group, P.poster('DO NOT TAKE\nTHE LAST\nCOFFEE', {
    w: 0.36, h: 0.5, accent: '#8c3a30', size: 8,
  }), 7.6, 1.7, DIV_C - WT / 2 - 0.012, Math.PI);
  // wall cabinets, so the break room is not two metres of bare paint
  group.add(P.boxMesh(2.2, 0.62, 0.34, { color: P.PALETTE.beige, jitter: 0.9 }, 7.7, 1.85, BOUNDS.minZ + 0.17));
  group.add(P.boxMesh(0.02, 0.1, 0.03, { color: P.PALETTE.metal }, 7.7, 1.6, BOUNDS.minZ + 0.35));

  put(group, P.pottedPlant({ dead: true, scale: 0.8 }), 6.5, 0, -5.9);

  /* -------------------------------------------------------- meeting room */

  const table = P.conferenceTable({ w: 1.2, l: 3.0 });
  put(group, table, bx - 0.05, 0, 4.0);
  props.conferenceTable = table;

  const phone = P.speakerphone({ r: 0.11 });
  put(group, phone, bx - 0.05, 0.74, 4.0, 0.6);
  props.speakerphone = phone;

  const seatRows = [
    [8.25, 2.95, Math.PI / 2],
    [8.25, 4.05, Math.PI / 2],
    [8.25, 5.15, Math.PI / 2],
    [10.55, 2.95, -Math.PI / 2],
    [10.55, 4.05, -Math.PI / 2],
    [10.55, 5.15, -Math.PI / 2],
  ];
  for (let i = 0; i < seatRows.length; i++) {
    const [cx, cz, yaw] = seatRows[i];
    put(group, P.officeChair({ arms: i === 0 }), cx, 0, cz, yaw + (i % 2 ? 0.1 : -0.08));
  }
  put(group, P.officeChair(), bx - 0.05, 0, 6.1, Math.PI);
  // three spares against the east wall, for a headcount that no longer exists
  for (let i = 0; i < 3; i++) {
    put(group, P.officeChair({ color: P.PALETTE.fabricWorn }),
      BOUNDS.maxX - 0.55, 0, 2.2 + i * 0.85, -Math.PI / 2 + (i - 1) * 0.25);
  }

  const mBoard = P.whiteboard({ w: 2.4, h: 1.2, wheels: false, map: P.whiteboardScrawlTexture() });
  put(group, mBoard, 8.2, 1.0, DIV_C + WT / 2 + 0.012);
  props.whiteboardMeeting = mBoard;

  const screen = P.projectorScreen({ w: 1.7, h: 1.45, top: 2.52 });
  put(group, screen, 11.2, 0, DIV_C + WT / 2 + 0.03);
  props.projectorScreen = screen;
  swayers.push({ o: screen.userData.sheet, a: 0.006, f: 0.42, p: 0.7 });

  put(group, P.motivationalPoster({ word: 'RUNWAY', caption: 'every road ends somewhere' }),
    10.4, 1.62, BOUNDS.maxZ - 0.02, Math.PI);
  put(group, P.poster('BOOK THE\nROOM', { w: 0.32, h: 0.42, accent: '#3f5d8c', size: 9 }),
    7.4, 1.62, BOUNDS.maxZ - 0.02, Math.PI);
  put(group, P.pottedPlant({ dead: false, scale: 0.9 }), 6.6, 0, 6.6);

  /* ------------------------------------------------------ ceiling panels */

  /** @type {THREE.Group[]} */
  const panels = [];
  const panelSpots = [
    [-9.4, -4.4], [-9.4, -1.0], [-9.4, 1.0],
    [-2.5, -4.6], [0.6, -4.6], [3.6, -4.6],
    [-2.5, -1.0], [0.6, -1.0], [3.6, -1.0],
    [-1.2, 3.4], [2.4, 3.4], [-5.0, 5.6],
    [7.6, -4.6], [10.8, -4.6], [8.4, -1.6],
    [7.9, 2.6], [11.0, 2.6], [8.4, 5.4], [11.4, 5.4],
  ];
  for (const [px, pz] of panelSpots) {
    const flick = px === -2.5 && pz === -1.0;
    const pan = P.ceilingPanel({ flicker: flick });
    put(group, pan, px, BOUNDS.ceil - 0.012, pz);
    panels.push(pan);
    if (flick) props.flickerPanel = pan;
  }

  /* -------------------------------------------------------------- lights */

  // EXACTLY 4 point lights + 1 ambient. See the module header.
  const ambient = new THREE.AmbientLight(0x53625a, 1.0);
  group.add(ambient);

  /** @type {Array<{light:THREE.PointLight, base:number, room:string}>} */
  const rigs = [];
  /**
   * @param {number} x @param {number} z @param {number} color
   * @param {number} intensity @param {number} distance @param {string} room
   * @returns {THREE.PointLight}
   */
  function addLight(x, z, color, intensity, distance, room) {
    const l = new THREE.PointLight(color, intensity, distance);
    l.position.set(x, 2.45, z);
    l.name = `key_${room}`;
    group.add(l);
    rigs.push({ light: l, base: intensity, room });
    return l;
  }

  const lBullpen = addLight(0.2, -0.6, 0xbfd4e8, 2.25, 28, 'bullpen');
  const lReception = addLight(-9.8, -1.4, 0xffc98a, 1.35, 16, 'reception');
  const lBreak = addLight(9.4, -3.2, 0xffc98a, 1.45, 14, 'break');
  const lMeeting = addLight(9.4, 3.6, 0xbfd4e8, 1.7, 15, 'meeting');

  /** Per-room dimming factor, lerped toward `focusTarget`. */
  const focusNow = rigs.map(() => 1);
  const focusTarget = rigs.map(() => 1);

  /* --------------------------------------------------------------- marks */

  /** @type {Object<string, THREE.Vector3>} */
  const marks = {
    // reception
    reception: mark(-9.2, -2.4),
    receptionBehindDesk: mark(-12.05, -2.0),
    receptionChairs: mark(-9.4, 0.9),
    deskKiki: mark(-12.05, -2.8),
    seatKiki: mark(-12.05, -2.8),
    logoWall: mark(-10.2, -2.4),
    hiringPoster: mark(-6.9, -4.4),

    // doors
    doorway: mark(-5.9, -0.1),
    breakDoor: mark(5.9, -1.6),
    meetingDoor: mark(5.9, 3.6),

    // bullpen
    bullpenCenter: mark(0, 0.9),
    bullpenNorth: mark(0, -6.0),
    windowWall: mark(0.6, -6.0),
    deskBrad: mark(-3.3, -4.45),
    deskDez: mark(0.0, -4.45),
    deskMarge: mark(3.3, -4.45),
    deskRoop: mark(-1.65, -1.65),
    deskEmpty: mark(1.65, -1.65),
    seatBrad: mark(-3.28, -5.15),
    seatDez: mark(0.02, -5.15),
    seatMarge: mark(3.32, -5.15),
    seatRoop: mark(-1.65, -1.10),
    seatEmpty: mark(1.95, -1.10),
    whiteboard: mark(-3.50, 1.82),
    waterCooler: mark(4.55, 1.4),
    deadPlant: mark(4.3, -5.9),

    // hallway / back
    hallway: mark(-2.0, 4.9),
    copier: mark(-4.6, 4.95),
    boxes: mark(0.2, 5.1),

    // break room
    breakRoom: mark(8.5, -1.3),
    breakTable: mark(9.4, -1.8),
    breakSeat1: mark(8.58, -2.53),
    breakSeat2: mark(9.40, -3.95),
    breakSeat3: mark(10.22, -2.53),
    fridge: mark(11.3, -5.85),
    microwave: mark(7.4, -5.35),
    coffee: mark(8.7, -5.35),
    sink: mark(10.25, -5.35),
    vending: mark(11.6, -1.4),

    // meeting room
    meetingRoom: mark(7.0, 3.6),
    meetingHead: mark(9.4, 1.15),
    meetingBoard: mark(8.2, 1.2),
    projector: mark(11.2, 1.2),
    meetingSeat1: mark(8.25, 2.95),
    meetingSeat2: mark(8.25, 4.05),
    meetingSeat3: mark(10.55, 2.95),
    meetingSeat4: mark(10.55, 4.05),
    meetingSeat5: mark(8.25, 5.15),
    meetingSeat6: mark(10.55, 5.15),
    meetingFoot: mark(9.4, 6.1),
  };

  /* --------------------------------------------------------------- shots */

  /** @type {Object<string, {pos:number[], look:number[], fov?:number}>} */
  const shots = {
    establish: shot(-2.4, 2.42, 6.6, 2.2, 0.95, -3.4, 62),
    bullpenWide: shot(-3.6, 1.80, 3.9, 1.4, 1.05, -3.6),
    bullpenLow: shot(-1.0, 0.45, 1.6, 0.4, 1.2, -3.4, 62),
    bullpenReverse: shot(1.6, 1.6, -6.0, -1.6, 1.15, -1.6),
    deskRowA: shot(-5.30, 1.45, -4.90, -2.6, 1.20, -4.3, 52),
    deskRowB: shot(-3.6, 1.45, -0.5, -1.6, 1.15, -1.8, 50),
    floorLevel: shot(1.4, 0.28, 2.6, -1.0, 1.05, -2.8, 62),
    ceiling: shot(-2.4, 0.9, 1.9, -2.5, 2.70, -1.2, 58),
    whiteboard: shot(-3.06, 1.50, 3.83, -4.55, 1.40, 1.95, 52),
    waterCooler: shot(3.0, 1.5, 0.4, 5.35, 1.15, 1.4, 52),
    windowWall: shot(0.0, 1.58, -1.4, 0.0, 1.45, -6.9, 56),

    receptionDesk: shot(-8.1, 1.66, -2.3, -11.9, 1.5, -2.42, 52),
    receptionWide: shot(-7.2, 1.80, -5.6, -10.8, 1.05, -0.6, 62),
    logoWall: shot(-9.6, 1.5, -2.4, -12.9, 1.60, -1.55, 50),

    doorway: shot(-4.0, 1.58, -0.14, -10.6, 1.42, -0.50, 54),
    hallway: shot(1.8, 1.70, 2.0, -4.2, 1.00, 5.8, 60),
    copier: shot(-3.3, 1.20, 3.9, -4.6, 0.80, 5.85, 52),

    breakWide: shot(6.8, 1.75, -0.9, 10.2, 1.05, -4.6, 60),
    breakTable: shot(9.4, 1.45, -0.7, 9.4, 0.9, -3.3, 52),
    breakCounter: shot(8.3, 1.66, -3.5, 8.8, 1.32, -6.4, 58),
    fridge: shot(10.3, 1.5, -3.8, 12.4, 1.2, -5.9, 52),
    vending: shot(10.2, 1.45, -3.0, 11.6, 1.1, -0.6, 52),

    meetingWide: shot(6.6, 1.85, 6.4, 9.9, 1.0, 3.2, 60),
    meetingHead: shot(9.4, 1.55, 7.0, 9.4, 1.3, 0.9, 52),
    meetingReverse: shot(9.4, 1.6, 1.75, 9.4, 1.15, 5.4, 54),
    meetingTable: shot(7.4, 1.25, 5.6, 9.6, 0.85, 3.6, 54),
    projector: shot(11.5, 1.50, 4.4, 11.2, 1.62, 0.40, 52),
  };

  /* -------------------------------------------------------------- update */

  const hands = /** @type {any} */ (clock.userData);
  let flickerState = 1;
  let flickerNext = 0;

  /**
   * Drives the flickering panel, the CRT scroll, the clock and the HVAC drift.
   * @param {number} dt seconds since the last frame
   * @param {number} t seconds since the stage started
   * @returns {void}
   */
  function update(dt, t) {
    // --- the panel that maintenance keeps promising to look at -----------
    if (t >= flickerNext) {
      // long stretches of "fine", then a burst of stutter
      const calm = flickerState > 0.5;
      flickerState = calm ? 0.24 + Math.random() * 0.26 : 0.84 + Math.random() * 0.16;
      flickerNext = t + (calm ? 0.04 + Math.random() * 0.12 : 0.25 + Math.random() * 2.6);
    }
    const panelLevel = flickerState * (0.94 + Math.sin(t * 41) * 0.06);
    if (props.flickerPanel) props.flickerPanel.userData.setLevel(panelLevel);

    // --- room focus -------------------------------------------------------
    for (let i = 0; i < rigs.length; i++) {
      const k = Math.min(1, dt * 5);
      focusNow[i] += (focusTarget[i] - focusNow[i]) * k;
      let v = rigs[i].base * focusNow[i];
      if (rigs[i].room === 'bullpen') v *= 0.93 + panelLevel * 0.07;
      rigs[i].light.intensity = v;
    }

    // --- CRTs -------------------------------------------------------------
    for (let i = 0; i < monitors.length; i++) {
      monitors[i].userData.scroll(dt * (0.055 + i * 0.011));
    }

    // --- the clock, running at 90x so you can watch the day go ------------
    const mins = t * 1.5 + 34;
    hands.minuteHand.rotation.z = -(mins / 60) * Math.PI * 2;
    hands.hourHand.rotation.z = -((mins / 720) * Math.PI * 2 + Math.PI * 1.55);

    // --- HVAC -------------------------------------------------------------
    for (const s of swayers) {
      s.o.rotation.z = Math.sin(t * s.f + s.p) * s.a;
    }
    if (props.speakerphone) {
      const led = props.speakerphone.userData.led;
      const on = (t % 3) < 0.12;
      led.material.uniforms.uEmissive.value.setRGB(on ? 0.55 : 0.09, on ? 0.09 : 0.02, on ? 0.06 : 0.02);
    }
    if (props.copier) {
      const lamp = props.copier.userData.lamp;
      const g = 0.28 + Math.max(0, Math.sin(t * 0.8)) * 0.5;
      lamp.material.uniforms.uEmissive.value.setRGB(0.06, g, 0.28);
    }
  }

  /**
   * Dims every point light that is not lighting `room`. Pass `null` or
   * `'all'` to bring the whole floor back up.
   * @param {'bullpen'|'break'|'meeting'|'reception'|'hallway'|'all'|null} [room]
   * @returns {void}
   */
  function focusRoom(room) {
    const r = room === 'hallway' ? 'bullpen' : room;
    for (let i = 0; i < rigs.length; i++) {
      focusTarget[i] = (!r || r === 'all' || rigs[i].room === r) ? 1 : 0.3;
    }
  }

  /**
   * Removes the set from its parent. Shared geometry and textures stay alive
   * for other sets — `props.disposeSharedAssets()` handles those at teardown.
   * @returns {void}
   */
  function dispose() {
    if (group.parent) group.parent.remove(group);
  }

  return {
    group,
    marks,
    shots,
    props,
    update,
    focusRoom,
    lights: { ambient, points: [lBullpen, lReception, lBreak, lMeeting] },
    dispose,
  };
}
