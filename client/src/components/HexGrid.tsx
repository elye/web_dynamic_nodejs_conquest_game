import { useRef, useEffect, useCallback } from 'react';
import type { Hex, HexCoord, Province } from '@conquest/shared';
import { TerrainType, UnitType, StructureType, UNIT_COST } from '@conquest/shared';
import { hexToPixel, pixelToHex, getHexPath, getHexCorners, getHexNeighbors, DEFAULT_HEX_SIZE } from '../utils/hexUtils';
import {
  getPlayerColorById,
  NEUTRAL_HEX_FILL,
  NEUTRAL_BORDER,
  WATER_HEX_FILL,
  WATER_BORDER,
  SELECTED_STROKE,
} from '../utils/colors';

interface HexGridProps {
  hexes: Hex[];
  provinces: Province[];
  selectedHex: HexCoord | null;
  onHexClick: (q: number, r: number) => void;
  currentPlayerId: string | null;
  currentTurnPlayerId?: string | null;
  playerIds: string[];
  validTargets?: HexCoord[];
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

export default function HexGrid({
  hexes,
  provinces,
  selectedHex,
  onHexClick,
  currentPlayerId,
  currentTurnPlayerId,
  playerIds,
  validTargets = [],
}: HexGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);
  const hoveredHexRef = useRef<HexCoord | null>(null);
  const hasAutoFittedRef = useRef(false);

  // Build a lookup for hexes and valid targets
  const hexMapRef = useRef<Map<string, Hex>>(new Map());
  const validTargetSetRef = useRef<Set<string>>(new Set());
  const provinceByHexRef = useRef<Map<string, Province>>(new Map());

  useEffect(() => {
    const map = new Map<string, Province>();
    for (const prov of provinces) {
      for (const h of prov.hexes) {
        map.set(`${h.q},${h.r}`, prov);
      }
    }
    provinceByHexRef.current = map;
  }, [provinces]);

  useEffect(() => {
    const map = new Map<string, Hex>();
    for (const hex of hexes) {
      map.set(`${hex.coord.q},${hex.coord.r}`, hex);
    }
    hexMapRef.current = map;
  }, [hexes]);

  useEffect(() => {
    const set = new Set<string>();
    for (const t of validTargets) {
      set.add(`${t.q},${t.r}`);
    }
    validTargetSetRef.current = set;
  }, [validTargets]);

  // Convert screen coords to world coords
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const cam = cameraRef.current;
    return {
      x: (sx - cam.x) / cam.zoom,
      y: (sy - cam.y) / cam.zoom,
    };
  }, []);

  // Get hex colors (fill and border)
  const getHexColors = useCallback(
    (hex: Hex): { fill: string; border: string } => {
      if (hex.terrain === TerrainType.WATER) return { fill: WATER_HEX_FILL, border: WATER_BORDER };
      if (hex.owner) {
        const pc = getPlayerColorById(hex.owner, playerIds);
        return { fill: pc.fill, border: pc.border };
      }
      return { fill: NEUTRAL_HEX_FILL, border: NEUTRAL_BORDER };
    },
    [playerIds],
  );

  // Draw the entire canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const cam = cameraRef.current;

    // Reset transform to identity and clear full canvas in device-pixel space
    // to prevent rendering artifacts when panning/zooming
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Re-apply DPR scaling, then camera transform
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.zoom, cam.zoom);

    const size = DEFAULT_HEX_SIZE;
    const isMyTurn = currentTurnPlayerId === currentPlayerId;
    const pulseAlpha = (Math.sin(Date.now() / 400) + 1) / 2; // 0..1 oscillation
    const glowRadius = 8 + pulseAlpha * 8; // 8..16 shadow blur

    for (const hex of hexes) {
      const { x: cx, y: cy } = hexToPixel(hex.coord.q, hex.coord.r, size);
      const path = getHexPath(cx, cy, size);

      // Determine colors
      const colors = getHexColors(hex);

      // Fill
      ctx.fillStyle = colors.fill;
      ctx.fill(path);

      const isSelected =
        selectedHex &&
        hex.coord.q === selectedHex.q &&
        hex.coord.r === selectedHex.r;
      const isValidTarget = validTargetSetRef.current.has(
        `${hex.coord.q},${hex.coord.r}`,
      );
      const hovered = hoveredHexRef.current;
      const isHovered =
        hovered &&
        hex.coord.q === hovered.q &&
        hex.coord.r === hovered.r;

      // Hover overlay (drawn before icons so emojis appear on top)
      if (isHovered && !isSelected) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fill(path);
      }

      // Dim non-target tiles when valid targets exist (unit selected)
      const hasTargets = validTargetSetRef.current.size > 0;
      if (hasTargets && !isValidTarget && !isSelected) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fill(path);
      }

      // Border
      if (isSelected) {
        ctx.strokeStyle = SELECTED_STROKE;
        ctx.lineWidth = 3;
      } else {
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 1;
      }
      ctx.stroke(path);

      // Pulse glow for unmoved units and affordable capitals
      if (isMyTurn && currentPlayerId) {
        const shouldPulseUnit = hex.unit && hex.unit.owner === currentPlayerId && !hex.unit.hasMoved;
        const province = provinceByHexRef.current.get(`${hex.coord.q},${hex.coord.r}`);
        const shouldPulseCapital = !shouldPulseUnit && hex.structure?.isCapitol
          && hex.structure.owner === currentPlayerId
          && province && province.gold >= UNIT_COST[UnitType.PEASANT];

        if (shouldPulseUnit || shouldPulseCapital) {
          const color = shouldPulseUnit ? [255, 220, 50] : [50, 220, 100];
          ctx.save();
          // Outer glow ring
          ctx.shadowColor = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${0.6 + pulseAlpha * 0.4})`;
          ctx.shadowBlur = glowRadius;
          ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${0.5 + pulseAlpha * 0.5})`;
          ctx.lineWidth = 3 + pulseAlpha * 2;
          ctx.stroke(path);
          // Double-stroke for stronger visibility
          ctx.stroke(path);
          ctx.restore();
        }
      }

      // Draw emoji icons LAST so they always appear on top of overlays
      // Tree
      if (hex.hasTree && hex.terrain !== TerrainType.WATER) {
        ctx.fillStyle = '#000';
        ctx.font = `${Math.round(size * 0.6)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🌲', cx, cy);
      }

      // Mountain indicator
      if (hex.terrain === TerrainType.MOUNTAIN) {
        ctx.fillStyle = '#000';
        ctx.font = `${Math.round(size * 0.6)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⛰️', cx, cy);
      }

      // Structure
      if (hex.structure) {
        const emoji = hex.structure.type === StructureType.CASTLE
          ? '🏯'
          : hex.structure.type === StructureType.TOWER
            ? '🏰'
            : '🏠';
        ctx.fillStyle = '#000';
        ctx.font = `${Math.round(size * 0.6)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, cx, cy - size * 0.1);

        // Hourglass for newly built structures (can't jump through yet)
        if (hex.structure.builtThisTurn && hex.structure.owner === currentPlayerId) {
          ctx.font = `${Math.round(size * 0.25)}px serif`;
          ctx.fillText('⏳', cx - size * 0.3, cy - size * 0.35);
        }

        // Star icon for capitols
        if (hex.structure.isCapitol) {
          ctx.font = `${Math.round(size * 0.3)}px serif`;
          ctx.fillText('⭐', cx + size * 0.3, cy - size * 0.35);
        }

        // Gold badge on current player's capitols
        if (hex.structure.isCapitol && hex.structure.owner === currentPlayerId) {
          const prov = provinceByHexRef.current.get(`${hex.coord.q},${hex.coord.r}`);
          if (prov) {
            const goldText = `${prov.gold}g`;
            const badgeY = cy + size * 0.3;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.font = `bold ${Math.round(size * 0.22)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const tw = ctx.measureText(goldText).width + 6;
            const bh = size * 0.26;
            ctx.beginPath();
            ctx.roundRect(cx - tw / 2, badgeY - bh / 2, tw, bh, 3);
            ctx.fill();
            ctx.fillStyle = '#fbbf24';
            ctx.fillText(goldText, cx, badgeY);
          }
        }
      }

      // Unit
      if (hex.unit) {
        const emoji = getUnitEmoji(hex.unit.type);
        ctx.fillStyle = '#000';
        ctx.font = `${Math.round(size * 0.6)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, cx, cy - size * 0.1);

        // Strength badge
        const badgeY = cy + size * 0.3;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(cx, badgeY, size * 0.17, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1e293b';
        ctx.font = `bold ${Math.round(size * 0.25)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(hex.unit.strength), cx, badgeY);

      }

      // Death marker (starvation)
      if (hex.deathMarker === 'starvation') {
        ctx.font = `${Math.round(size * 0.55)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('☠️', cx, cy);
      }
    }

    // Draw territory borders for the current turn player
    // Only draw on edges where the neighbor is NOT owned by the same player
    const currentTurnPlayer = currentTurnPlayerId;
    if (currentTurnPlayer) {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';

      // The 6 neighbor directions for axial coords, matching corner edge order for pointy-top:
      // Edge between corner[i] and corner[(i+1)%6] faces neighbor direction[i]
      const NEIGHBOR_DIRS = [
        { dq: 1, dr: 0 },    // edge 0→1: east
        { dq: 0, dr: 1 },    // edge 1→2: southeast
        { dq: -1, dr: 1 },   // edge 2→3: southwest
        { dq: -1, dr: 0 },   // edge 3→4: west
        { dq: 0, dr: -1 },   // edge 4→5: northwest
        { dq: 1, dr: -1 },   // edge 5→0: northeast
      ];

      for (const hex of hexes) {
        if (hex.owner !== currentTurnPlayer) continue;
        const { x: cx, y: cy } = hexToPixel(hex.coord.q, hex.coord.r, size);
        const corners = getHexCorners(cx, cy, size);

        for (let i = 0; i < 6; i++) {
          const dir = NEIGHBOR_DIRS[i];
          const nq = hex.coord.q + dir.dq;
          const nr = hex.coord.r + dir.dr;
          const neighbor = hexMapRef.current.get(`${nq},${nr}`);

          // Draw edge if neighbor doesn't exist or isn't owned by same player
          if (!neighbor || neighbor.owner !== currentTurnPlayer) {
            const c1 = corners[i];
            const c2 = corners[(i + 1) % 6];
            ctx.beginPath();
            ctx.moveTo(c1.x, c1.y);
            ctx.lineTo(c2.x, c2.y);
            ctx.stroke();
          }
        }
      }
    }

    ctx.restore();

    // Hovered hex tooltip
    const hoveredHex = hoveredHexRef.current;
    if (hoveredHex) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      const text = `(${hoveredHex.q}, ${hoveredHex.r})`;
      ctx.font = '12px monospace';
      const metrics = ctx.measureText(text);
      const tw = metrics.width + 8;
      ctx.fillRect(8, height - 28, tw, 20);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, 12, height - 14);
    }
  }, [hexes, selectedHex, getHexColors, currentPlayerId, currentTurnPlayerId, provinces]);

  // On-demand rendering: schedule a single rAF draw (no continuous loop)
  const requestDraw = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => draw());
  }, [draw]);

  // Redraw when game state or draw function changes
  useEffect(() => {
    requestDraw();
  }, [requestDraw]);

  // Pulse animation: redraw at ~20fps when it's the player's turn (for glow effects)
  useEffect(() => {
    if (currentTurnPlayerId !== currentPlayerId) return;
    const id = setInterval(() => requestDraw(), 50);
    return () => clearInterval(id);
  }, [currentTurnPlayerId, currentPlayerId, requestDraw]);

  // Store draw in a ref so ResizeObserver always uses the latest without re-subscribing
  const drawRef = useRef(draw);
  useEffect(() => { drawRef.current = draw; }, [draw]);

  // Fit camera to map bounds — reusable for initial load & orientation changes
  const fitCamera = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || hexes.length === 0) return;

    const landHexes = hexes.filter(h => h.terrain !== TerrainType.WATER);
    if (landHexes.length === 0) return;

    const size = DEFAULT_HEX_SIZE;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const hex of landHexes) {
      const { x, y } = hexToPixel(hex.coord.q, hex.coord.r, size);
      minX = Math.min(minX, x - size);
      maxX = Math.max(maxX, x + size);
      minY = Math.min(minY, y - size);
      maxY = Math.max(maxY, y + size);
    }

    const gridWidth = maxX - minX;
    const gridHeight = maxY - minY;
    const gridCenterX = (minX + maxX) / 2;
    const gridCenterY = (minY + maxY) / 2;

    const rect = canvas.getBoundingClientRect();
    const canvasW = rect.width;
    const canvasH = rect.height;
    const padding = 40;
    const scaleX = (canvasW - padding * 2) / gridWidth;
    const scaleY = (canvasH - padding * 2) / gridHeight;
    const zoom = Math.min(scaleX, scaleY, MAX_ZOOM);

    const cam = cameraRef.current;
    cam.zoom = zoom;
    cam.x = canvasW / 2 - gridCenterX * zoom;
    cam.y = canvasH / 2 - gridCenterY * zoom;
  }, [hexes]);

  // Track last container dimensions to detect orientation changes
  const lastSizeRef = useRef({ w: 0, h: 0 });

  // Resize canvas to fill container — separate from draw to avoid re-subscribing
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const newW = rect.width;
      const newH = rect.height;

      canvas.width = newW * devicePixelRatio;
      canvas.height = newH * devicePixelRatio;
      canvas.style.width = `${newW}px`;
      canvas.style.height = `${newH}px`;

      // Detect orientation/aspect-ratio change and re-center the map
      const { w: prevW, h: prevH } = lastSizeRef.current;
      const wasLandscape = prevW > prevH;
      const isLandscape = newW > newH;
      const orientationChanged = prevW > 0 && wasLandscape !== isLandscape;
      // Also re-center on significant resize (>20% change in either dimension)
      const significantResize = prevW > 0 && (
        Math.abs(newW - prevW) / prevW > 0.2 || Math.abs(newH - prevH) / prevH > 0.2
      );

      lastSizeRef.current = { w: newW, h: newH };

      if (orientationChanged || significantResize) {
        fitCamera();
      }

      // Draw synchronously to avoid blank frame after canvas clear
      drawRef.current();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize(); // Initial size

    return () => observer.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fit camera to land hexes on initial load
  useEffect(() => {
    if (hasAutoFittedRef.current || hexes.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    fitCamera();
    hasAutoFittedRef.current = true;
    requestDraw();
  }, [hexes, requestDraw, fitCamera]);

  // ── Pointer events (unified mouse + touch, no 300ms delay) ──
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDistRef = useRef<number>(0);
  const DRAG_THRESHOLD = 10; // pixels — movement under this counts as a tap

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Capture so we get pointermove/up even if pointer leaves canvas
    canvas.setPointerCapture(e.pointerId);

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 1) {
      // Single pointer: potential tap or pan
      pointerStartRef.current = { x: e.clientX, y: e.clientY };
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      isDraggingRef.current = false;
    } else if (activePointersRef.current.size === 2) {
      // Second pointer arrived: start pinch
      isDraggingRef.current = true;
      const pts = Array.from(activePointersRef.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      pinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!activePointersRef.current.has(e.pointerId)) {
      // Hover detection (mouse only, not touch)
      if (e.pointerType === 'mouse') {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = screenToWorld(sx, sy);
        const hex = pixelToHex(world.x, world.y);
        const key = `${hex.q},${hex.r}`;
        const prev = hoveredHexRef.current;
        if (hexMapRef.current.has(key)) {
          if (!prev || prev.q !== hex.q || prev.r !== hex.r) {
            hoveredHexRef.current = hex;
            requestDraw();
          }
        } else if (prev) {
          hoveredHexRef.current = null;
          requestDraw();
        }
      }
      return;
    }

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 1) {
      // Single pointer: pan or drag detection
      const dx = e.clientX - pointerStartRef.current.x;
      const dy = e.clientY - pointerStartRef.current.y;
      const distFromStart = Math.sqrt(dx * dx + dy * dy);

      if (!isDraggingRef.current && distFromStart > DRAG_THRESHOLD) {
        isDraggingRef.current = true;
      }

      if (isDraggingRef.current) {
        const moveDx = e.clientX - lastMouseRef.current.x;
        const moveDy = e.clientY - lastMouseRef.current.y;
        cameraRef.current.x += moveDx;
        cameraRef.current.y += moveDy;
        requestDraw();
      }
      lastMouseRef.current = { x: e.clientX, y: e.clientY };

      // Hover detection during mouse drag
      if (e.pointerType === 'mouse') {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = screenToWorld(sx, sy);
        const hex = pixelToHex(world.x, world.y);
        const key = `${hex.q},${hex.r}`;
        const prev = hoveredHexRef.current;
        if (hexMapRef.current.has(key)) {
          if (!prev || prev.q !== hex.q || prev.r !== hex.r) {
            hoveredHexRef.current = hex;
            requestDraw();
          }
        } else if (prev) {
          hoveredHexRef.current = null;
          requestDraw();
        }
      }
    } else if (activePointersRef.current.size === 2) {
      // Pinch zoom
      const pts = Array.from(activePointersRef.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / pinchDistRef.current;
      pinchDistRef.current = dist;

      const cam = cameraRef.current;
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = midX - rect.left;
      const my = midY - rect.top;

      const oldZoom = cam.zoom;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * scale));
      cam.x = mx - ((mx - cam.x) * newZoom) / oldZoom;
      cam.y = my - ((my - cam.y) * newZoom) / oldZoom;
      cam.zoom = newZoom;
      requestDraw();
    }
  }, [screenToWorld, requestDraw]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const wasActive = activePointersRef.current.has(e.pointerId);
    activePointersRef.current.delete(e.pointerId);

    if (!wasActive) return;

    // Single pointer release without dragging = tap/click
    if (activePointersRef.current.size === 0 && !isDraggingRef.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = screenToWorld(sx, sy);
      const hex = pixelToHex(world.x, world.y);
      if (hexMapRef.current.has(`${hex.q},${hex.r}`)) {
        onHexClick(hex.q, hex.r);
      }
    }

    // Reset drag state when all pointers released
    if (activePointersRef.current.size === 0) {
      isDraggingRef.current = false;
    }
  }, [screenToWorld, onHexClick]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size === 0) {
      isDraggingRef.current = false;
    }
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const cam = cameraRef.current;
    const oldZoom = cam.zoom;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * delta));

    // Zoom towards cursor
    cam.x = mx - ((mx - cam.x) * newZoom) / oldZoom;
    cam.y = my - ((my - cam.y) * newZoom) / oldZoom;
    cam.zoom = newZoom;
    requestDraw();
  }, [requestDraw]);

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ backgroundColor: '#0f172a' }}>
      <canvas
        ref={canvasRef}
        className="block touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

// ── Helpers ──

function getUnitEmoji(type: UnitType): string {
  switch (type) {
    case UnitType.PEASANT: return '🧑‍🌾';
    case UnitType.SPEARMAN: return '💂';
    case UnitType.BARON: return '🤴';
    case UnitType.KNIGHT: return '🐴';
    default: return '⚔️';
  }
}
