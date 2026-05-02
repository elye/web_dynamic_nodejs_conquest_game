import { useRef, useEffect, useCallback, useState } from 'react';
import type { Hex, HexCoord } from '@conquest/shared';
import { TerrainType } from '@conquest/shared';
import { hexToPixel, pixelToHex, getHexPath, DEFAULT_HEX_SIZE } from '../utils/hexUtils';
import {
  getPlayerColorById,
  NEUTRAL_HEX_FILL,
  WATER_HEX_FILL,
  FOREST_COLOR,
  MOUNTAIN_COLOR,
  GRID_STROKE,
  SELECTED_STROKE,
  VALID_TARGET_STROKE,
} from '../utils/colors';

interface HexGridProps {
  hexes: Hex[];
  selectedHex: HexCoord | null;
  onHexClick: (q: number, r: number) => void;
  currentPlayerId: string | null;
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
  selectedHex,
  onHexClick,
  currentPlayerId,
  playerIds,
  validTargets = [],
}: HexGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);
  const [hoveredHex, setHoveredHex] = useState<HexCoord | null>(null);

  // Build a lookup for hexes and valid targets
  const hexMapRef = useRef<Map<string, Hex>>(new Map());
  const validTargetSetRef = useRef<Set<string>>(new Set());

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

  // Get hex fill color
  const getHexFill = useCallback(
    (hex: Hex): string => {
      if (hex.terrain === TerrainType.WATER) return WATER_HEX_FILL;
      if (hex.owner) {
        return getPlayerColorById(hex.owner, playerIds).fill;
      }
      return NEUTRAL_HEX_FILL;
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

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.zoom, cam.zoom);

    const size = DEFAULT_HEX_SIZE;

    for (const hex of hexes) {
      const { x: cx, y: cy } = hexToPixel(hex.coord.q, hex.coord.r, size);
      const path = getHexPath(cx, cy, size);

      // Fill
      ctx.fillStyle = getHexFill(hex);
      ctx.fill(path);

      // Stroke
      const isSelected =
        selectedHex &&
        hex.coord.q === selectedHex.q &&
        hex.coord.r === selectedHex.r;
      const isValidTarget = validTargetSetRef.current.has(
        `${hex.coord.q},${hex.coord.r}`,
      );
      const isHovered =
        hoveredHex &&
        hex.coord.q === hoveredHex.q &&
        hex.coord.r === hoveredHex.r;

      if (isSelected) {
        ctx.strokeStyle = SELECTED_STROKE;
        ctx.lineWidth = 3;
      } else if (isValidTarget) {
        ctx.strokeStyle = VALID_TARGET_STROKE;
        ctx.lineWidth = 2;
      } else if (isHovered) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = GRID_STROKE;
        ctx.lineWidth = 1;
      }
      ctx.stroke(path);

      // Tree
      if (hex.hasTree && hex.terrain !== TerrainType.WATER) {
        drawTree(ctx, cx, cy, size);
      }

      // Mountain indicator
      if (hex.terrain === TerrainType.MOUNTAIN) {
        drawMountain(ctx, cx, cy, size);
      }

      // Structure
      if (hex.structure) {
        drawStructure(ctx, cx, cy, size);
      }

      // Unit
      if (hex.unit) {
        const ownerColor = getPlayerColorById(hex.unit.owner, playerIds);
        drawUnit(ctx, cx, cy, size, hex.unit.strength, ownerColor.base);
      }
    }

    ctx.restore();

    // Hovered hex tooltip
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
  }, [hexes, selectedHex, hoveredHex, getHexFill, playerIds]);

  // Animation loop
  useEffect(() => {
    const loop = () => {
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // Resize canvas to fill container
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(devicePixelRatio, devicePixelRatio);
    });
    observer.observe(container);
    // Initial size
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(devicePixelRatio, devicePixelRatio);

    // Center camera on the hex grid
    const cam = cameraRef.current;
    cam.x = rect.width / 2;
    cam.y = rect.height / 3;

    return () => observer.disconnect();
  }, []);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = false;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (e.buttons === 1) {
        // Pan
        const dx = e.clientX - lastMouseRef.current.x;
        const dy = e.clientY - lastMouseRef.current.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          isDraggingRef.current = true;
        }
        cameraRef.current.x += dx;
        cameraRef.current.y += dy;
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
      }

      // Hover detection
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = screenToWorld(sx, sy);
      const hex = pixelToHex(world.x, world.y);
      const key = `${hex.q},${hex.r}`;
      if (hexMapRef.current.has(key)) {
        setHoveredHex(hex);
      } else {
        setHoveredHex(null);
      }
    },
    [screenToWorld],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        return;
      }
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
    },
    [screenToWorld, onHexClick],
  );

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
  }, []);

  // Touch handlers for pinch-to-zoom
  const touchesRef = useRef<React.Touch[]>([]);
  const pinchDistRef = useRef<number>(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touches = Array.from(e.touches);
    touchesRef.current = touches;
    if (touches.length === 1) {
      lastMouseRef.current = { x: touches[0].clientX, y: touches[0].clientY };
      isDraggingRef.current = false;
    } else if (touches.length === 2) {
      const dx = touches[1].clientX - touches[0].clientX;
      const dy = touches[1].clientY - touches[0].clientY;
      pinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touches = Array.from(e.touches);
    if (touches.length === 1) {
      const dx = touches[0].clientX - lastMouseRef.current.x;
      const dy = touches[0].clientY - lastMouseRef.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) isDraggingRef.current = true;
      cameraRef.current.x += dx;
      cameraRef.current.y += dy;
      lastMouseRef.current = { x: touches[0].clientX, y: touches[0].clientY };
    } else if (touches.length === 2) {
      const dx = touches[1].clientX - touches[0].clientX;
      const dy = touches[1].clientY - touches[0].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / pinchDistRef.current;
      pinchDistRef.current = dist;

      const cam = cameraRef.current;
      const midX = (touches[0].clientX + touches[1].clientX) / 2;
      const midY = (touches[0].clientY + touches[1].clientY) / 2;
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
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.changedTouches.length === 1 && !isDraggingRef.current) {
        const touch = e.changedTouches[0];
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const sx = touch.clientX - rect.left;
        const sy = touch.clientY - rect.top;
        const world = screenToWorld(sx, sy);
        const hex = pixelToHex(world.x, world.y);
        if (hexMapRef.current.has(`${hex.q},${hex.r}`)) {
          onHexClick(hex.q, hex.r);
        }
      }
    },
    [screenToWorld, onHexClick],
  );

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        className="block touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
    </div>
  );
}

// ── Drawing helpers ──

function drawTree(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
) {
  const r = size * 0.2;
  ctx.fillStyle = FOREST_COLOR;
  ctx.beginPath();
  ctx.arc(cx, cy - size * 0.05, r, 0, Math.PI * 2);
  ctx.fill();
  // trunk
  ctx.fillStyle = '#92400e';
  ctx.fillRect(cx - 1.5, cy + r * 0.5 - size * 0.05, 3, size * 0.15);
}

function drawMountain(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
) {
  const s = size * 0.3;
  ctx.fillStyle = MOUNTAIN_COLOR;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx - s, cy + s * 0.5);
  ctx.lineTo(cx + s, cy + s * 0.5);
  ctx.closePath();
  ctx.fill();
  // snow cap
  ctx.fillStyle = '#e5e7eb';
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx - s * 0.3, cy - s * 0.3);
  ctx.lineTo(cx + s * 0.3, cy - s * 0.3);
  ctx.closePath();
  ctx.fill();
}

function drawStructure(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
) {
  const w = size * 0.2;
  const h = size * 0.4;
  ctx.fillStyle = '#78716c';
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  // roof
  ctx.fillStyle = '#57534e';
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2 - size * 0.1);
  ctx.lineTo(cx - w / 2 - 2, cy - h / 2);
  ctx.lineTo(cx + w / 2 + 2, cy - h / 2);
  ctx.closePath();
  ctx.fill();
}

function drawUnit(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  strength: number,
  color: string,
) {
  const r = size * 0.3;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Strength number
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(size * 0.3)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(strength), cx, cy);
}
