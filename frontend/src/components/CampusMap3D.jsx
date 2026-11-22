import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Html, Edges } from '@react-three/drei';
import * as THREE from 'three';
import api from '../api/client';
import {
  Layers,
  Compass,
  Eye,
  Info,
  X,
  Footprints,
  ShieldAlert,
  Truck,
  RotateCcw
} from 'lucide-react';

const SCALE = 0.05;

// Zone Visual Palette
const ZONE_CONFIG = {
  ADMIN: {
    color: '#3b82f6',
    emissive: '#1d4ed8',
    bg: 'bg-blue-600',
    border: 'border-blue-500',
    text: 'text-blue-600',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    label: 'Administration'
  },
  ACADEMIC: {
    color: '#0284c7',
    emissive: '#0369a1',
    bg: 'bg-sky-600',
    border: 'border-sky-500',
    text: 'text-sky-600',
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
    label: 'Academic Dept'
  },
  HOSTEL: {
    color: '#d97706',
    emissive: '#b45309',
    bg: 'bg-amber-600',
    border: 'border-amber-500',
    text: 'text-amber-600',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    label: 'Student Residence'
  },
  SPORTS: {
    color: '#059669',
    emissive: '#047857',
    bg: 'bg-emerald-600',
    border: 'border-emerald-500',
    text: 'text-emerald-600',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    label: 'Athletics & Sports'
  },
  UTILITY: {
    color: '#7c3aed',
    emissive: '#6d28d9',
    bg: 'bg-purple-600',
    border: 'border-purple-500',
    text: 'text-purple-600',
    badge: 'bg-purple-50 text-purple-700 border-purple-200',
    label: 'Utility & Health'
  }
};

/**
 * Campus Roads matching RVCE blueprint layout
 */
const ROAD_STRIPS = [
  // 1. Main Entrance Avenue (North-South, connecting Main Mailroom to central crossroad)
  { pos: [-4.0, 0.02, -18.0], size: [2.2, 0.01, 14.0] },
  // 2. North Academic Avenue (East-West across Admin, Civil, Sports ground)
  { pos: [0.0, 0.02, -14.5], size: [44.0, 0.01, 2.2] },
  // 3. West Spine (North-South past Mechanical and Biotech Quad)
  { pos: [-20.5, 0.02, 0.0], size: [2.2, 0.01, 38.0] },
  // 4. Center Spine (North-South past Civil, EEE, ECE)
  { pos: [-1.0, 0.02, -2.0], size: [2.2, 0.01, 24.0] },
  // 5. East Spine (North-South past CSE, Health Centre, Hostels, Mathematics)
  { pos: [13.0, 0.02, 5.0], size: [2.2, 0.01, 40.0] },
  // 6. Central Cross-Avenue (East-West below Admin / above Library)
  { pos: [-1.0, 0.02, 2.0], size: [36.0, 0.01, 2.2] },
  // 7. South Avenue (East-West connecting Library, Cauvery Hostel, Math Dept)
  { pos: [0.0, 0.02, 12.0], size: [40.0, 0.01, 2.2] },
  // 8. Far South Perimeter Road (past ISE/Aerospace and Math Dept)
  { pos: [0.0, 0.02, 19.0], size: [36.0, 0.01, 2.0] }
];

/**
 * 3D Extruded Building Component
 */
const BuildingMesh = ({ node, isHovered, isSelected, onHover, onClick }) => {
  const cfg = ZONE_CONFIG[node.zone] || ZONE_CONFIG.ACADEMIC;

  // Convert 0-1000 grid coordinates into centered 3D scene units
  const mapPos = node.mapPosition || { x: 500, y: 500, z: 0 };
  const dims = node.dimensions || { width: 80, depth: 60, height: 35 };

  const w = Math.max(1.5, dims.width * SCALE);
  const d = Math.max(1.5, dims.depth * SCALE);
  const h = node.zone === 'SPORTS' ? 0.35 : Math.max(1.0, dims.height * SCALE);

  const posX = (mapPos.x - 500) * SCALE;
  const posY = h / 2;
  const posZ = (mapPos.y - 500) * SCALE;

  return (
    <group position={[posX, 0, posZ]}>
      {/* Pedestrian-Only Restricted Base Ring */}
      {node.isPedestrianOnly && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(w, d) / 1.7, Math.max(w, d) / 1.7 + 0.35, 32]} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.8} />
        </mesh>
      )}

      {/* Building 3D Extruded Box */}
      <mesh
        position={[0, posY, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onClick(node);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(node);
        }}
        onPointerOut={() => onHover(null)}
      >
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color={isHovered || isSelected ? '#ffffff' : cfg.color}
          emissive={isHovered ? cfg.color : isSelected ? '#3b82f6' : '#000000'}
          emissiveIntensity={isHovered ? 0.45 : isSelected ? 0.3 : 0}
          roughness={0.25}
          metalness={0.15}
        />
        <Edges
          threshold={15}
          color={isSelected ? '#60a5fa' : isHovered ? '#ffffff' : '#e2e8f0'}
          opacity={isHovered || isSelected ? 0.9 : 0.4}
          transparent
        />
      </mesh>

      {/* Clean Building Label */}
      <Html
        position={[0, h + 0.6, 0]}
        center
        distanceFactor={32}
        style={{ pointerEvents: 'none' }}
      >
        <div
          className={`px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap shadow-sm border transition-all duration-150 select-none ${
            isSelected
              ? 'bg-blue-600 text-white border-white scale-110 shadow-lg'
              : isHovered
              ? 'bg-slate-900 text-white border-blue-400 scale-105'
              : 'bg-slate-900/80 text-slate-200 border-slate-700/60'
          }`}
        >
          {node.code || node.hubId}
        </div>
      </Html>
    </group>
  );
};

/**
 * Animated 3D Vehicle cruising along route stops
 */
const AnimatedVehicle = ({ points }) => {
  const vehicleRef = useRef();
  const [progress, setProgress] = useState(0);

  useFrame((state, delta) => {
    if (!vehicleRef.current || points.length < 2) return;

    // Advance speed along route
    const speed = 0.25;
    const newProgress = (progress + delta * speed) % (points.length - 1);
    setProgress(newProgress);

    const segmentIdx = Math.floor(newProgress);
    const segmentT = newProgress - segmentIdx;

    const pA = new THREE.Vector3(...points[segmentIdx]);
    const pB = new THREE.Vector3(...points[segmentIdx + 1]);

    const currentPos = new THREE.Vector3().lerpVectors(pA, pB, segmentT);
    vehicleRef.current.position.set(currentPos.x, 0.45, currentPos.z);

    // Orient vehicle towards next waypoint
    const dir = new THREE.Vector3().subVectors(pB, pA).normalize();
    if (dir.lengthSq() > 0.0001) {
      const angle = Math.atan2(dir.x, dir.z);
      vehicleRef.current.rotation.y = angle;
    }
  });

  if (points.length < 2) return null;

  return (
    <group ref={vehicleRef}>
      {/* Main Body */}
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[0.7, 0.35, 1.2]} />
        <meshStandardMaterial color="#0284c7" roughness={0.3} metalness={0.2} />
      </mesh>
      {/* Cabin Roof */}
      <mesh position={[0, 0.45, -0.1]}>
        <boxGeometry args={[0.6, 0.3, 0.6]} />
        <meshStandardMaterial color="#0f172a" roughness={0.1} />
      </mesh>
      {/* Headlight beam */}
      <pointLight color="#38bdf8" intensity={2} distance={3} position={[0, 0.3, 0.8]} />
      {/* Floating Transit Badge */}
      <Html position={[0, 0.9, 0]} center distanceFactor={25} style={{ pointerEvents: 'none' }}>
        <div className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[9px] font-black uppercase tracking-wider shadow-md animate-pulse">
          In Transit
        </div>
      </Html>
    </group>
  );
};

/**
 * Camera Viewport Manager for smooth preset angles
 */
const CameraManager = ({ viewPreset, controlsRef }) => {
  const { camera } = useThree();

  useEffect(() => {
    if (!controlsRef.current) return;

    if (viewPreset === 'top') {
      camera.position.set(0, 52, 0.01);
      controlsRef.current.target.set(0, 0, 0);
    } else if (viewPreset === 'front') {
      camera.position.set(0, 18, 45);
      controlsRef.current.target.set(0, 0, 0);
    } else {
      // 3D Isometric View default
      camera.position.set(0, 36, 44);
      controlsRef.current.target.set(0, 0, 0);
    }
    controlsRef.current.update();
  }, [viewPreset, camera, controlsRef]);

  return null;
};

/**
 * Main Interactive 3D Campus Map Component
 */
const CampusMap3D = ({
  routeStops = null,
  activeOrders = [],
  height = '500px',
  onSelectNode = null
}) => {
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [viewPreset, setViewPreset] = useState('iso'); // 'iso', 'top', 'front'
  const [showLegend, setShowLegend] = useState(false);

  const controlsRef = useRef();

  // 1. Fetch campus nodes from backend
  useEffect(() => {
    let isMounted = true;
    const fetchNodes = async () => {
      try {
        const res = await api.get('/nodes');
        if (isMounted && res.data?.data) {
          setNodes(res.data.data);
        }
      } catch {
        // Fallback to /delivery/nodes
        try {
          const fbRes = await api.get('/delivery/nodes');
          if (isMounted && fbRes.data?.data) {
            setNodes(fbRes.data.data);
          }
        } catch (innerErr) {
          console.error('Failed to load campus 3D nodes:', innerErr);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchNodes();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Compute 3D Route Waypoint Points
  const routePoints = useMemo(() => {
    if (!routeStops || routeStops.length < 2) return [];

    // Map ordered stops to 3D points elevated at y = 0.5
    return routeStops.map((stop) => {
      const pos = stop.mapPosition || { x: 500, y: 500, z: 0 };
      const posX = (pos.x - 500) * SCALE;
      const posZ = (pos.y - 500) * SCALE;
      return [posX, 0.5, posZ];
    });
  }, [routeStops]);

  const handleNodeClick = (node) => {
    setSelectedNode(node);
    if (onSelectNode) onSelectNode(node);
  };

  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 font-sans select-none"
      style={{ height }}
    >
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-30 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center">
          <div className="flex items-center space-x-3 text-slate-200 text-sm font-medium">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span>Loading 3D Campus Architectural Model...</span>
          </div>
        </div>
      )}

      {/* Floating Header UI */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <div className="bg-slate-900/85 backdrop-blur-md border border-slate-700/60 rounded-xl px-3.5 py-2 shadow-lg flex items-center gap-2.5">
          <Compass className="w-4 h-4 text-blue-400 animate-spin-slow" />
          <span className="text-xs font-bold text-slate-100 tracking-wide uppercase">
            RVCE 3D Campus Freight Grid
          </span>
          <span className="bg-blue-500/20 text-blue-300 text-[10px] font-mono px-1.5 py-0.5 rounded border border-blue-500/30">
            1000×1000m
          </span>
        </div>

        {activeOrders && activeOrders.length > 0 && (
          <div className="bg-slate-900/85 backdrop-blur-md border border-emerald-500/40 text-emerald-300 text-xs px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 shadow-lg">
            <Truck className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>{activeOrders.length} In-Transit</span>
          </div>
        )}
      </div>

      {/* Floating Control Toolbar (Top-Right) */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        {/* Preset Camera View Buttons */}
        <div className="bg-slate-900/85 backdrop-blur-md border border-slate-700/60 rounded-xl p-1 shadow-lg flex items-center gap-1">
          <button
            onClick={() => setViewPreset('iso')}
            title="3D Isometric Perspective"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewPreset === 'iso'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>3D View</span>
          </button>
          <button
            onClick={() => setViewPreset('top')}
            title="Top-Down 2D Architectural Blueprint"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewPreset === 'top'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Blueprint</span>
          </button>
          <button
            onClick={() => setViewPreset('front')}
            title="Front Elevation Angle"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewPreset === 'front'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Front</span>
          </button>
        </div>

        {/* Legend Toggle */}
        <button
          onClick={() => setShowLegend(!showLegend)}
          className={`p-2 rounded-xl border backdrop-blur-md shadow-lg transition-all cursor-pointer ${
            showLegend
              ? 'bg-blue-600 text-white border-blue-500'
              : 'bg-slate-900/85 text-slate-300 border-slate-700/60 hover:bg-slate-800'
          }`}
          title="Toggle Zone Legend"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>

      {/* Expandable Zone Legend Modal/Pill */}
      {showLegend && (
        <div className="absolute top-16 right-4 z-20 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-4 shadow-2xl w-64 space-y-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Campus Zone Guide
            </span>
            <button
              onClick={() => setShowLegend(false)}
              className="text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2 text-xs">
            {Object.entries(ZONE_CONFIG).map(([key, val]) => (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-sm ${val.bg}`} />
                  <span className="text-slate-300">{val.label}</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">{key}</span>
              </div>
            ))}
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-amber-400">
              <div className="flex items-center gap-2">
                <Footprints className="w-3.5 h-3.5" />
                <span>Pedestrian-Only Node</span>
              </div>
              <span className="text-[10px] text-amber-500 font-mono">ECart/Trolley</span>
            </div>
          </div>
        </div>
      )}

      {/* Selected Building Details Drawer (Bottom Left) */}
      {selectedNode && (
        <div className="absolute bottom-4 left-4 z-20 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-4 shadow-2xl max-w-sm w-full space-y-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white">{selectedNode.name}</h4>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-blue-400 border border-slate-700">
                  {selectedNode.code || selectedNode.hubId}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Zone: <strong className="text-slate-200">{selectedNode.zone}</strong>
              </p>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800">
            <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 block">3D Coordinates</span>
              <span className="font-mono text-slate-200 text-xs">
                X: {selectedNode.mapPosition?.x}, Y: {selectedNode.mapPosition?.y}
              </span>
            </div>
            <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Extrusion (W×D×H)</span>
              <span className="font-mono text-slate-200 text-xs">
                {selectedNode.dimensions?.width}×{selectedNode.dimensions?.depth}×{selectedNode.dimensions?.height}m
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 block">Accessible Freight Fleets</span>
            <div className="flex flex-wrap gap-1.5">
              {(selectedNode.accessibleBy || ['ECART', 'HAND_TROLLEY']).map((type) => (
                <span
                  key={type}
                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1"
                >
                  <Truck className="w-2.5 h-2.5 text-blue-400" />
                  {type}
                </span>
              ))}
            </div>
          </div>

          {selectedNode.isPedestrianOnly && (
            <div className="flex items-center gap-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Pedestrian zone: Delivery vans strictly prohibited here.</span>
            </div>
          )}
        </div>
      )}

      {/* 3D WebGL Canvas */}
      <Canvas
        shadows
        camera={{ position: [0, 36, 44], fov: 45 }}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      >
        <color attach="background" args={['#090d16']} />

        {/* Ambient & Directional Lighting */}
        <ambientLight intensity={0.7} />
        <directionalLight
          position={[30, 50, 20]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight position={[-20, 30, -20]} intensity={0.5} />
        <pointLight position={[0, 20, 0]} intensity={0.6} color="#38bdf8" />

        {/* Architectural Ground Plane */}
        <mesh position={[0, -0.05, 0]} receiveShadow>
          <boxGeometry args={[56, 0.1, 56]} />
          <meshStandardMaterial color="#0f172a" roughness={0.85} metalness={0.15} />
          <Edges color="#1e293b" opacity={0.6} transparent />
        </mesh>

        {/* Subtle Architectural Grid on Ground */}
        <gridHelper args={[54, 54, '#334155', '#1e293b']} position={[0, 0.01, 0]} />

        {/* Campus Roads Network */}
        <group>
          {ROAD_STRIPS.map((road, idx) => (
            <mesh key={idx} position={road.pos} receiveShadow>
              <boxGeometry args={road.size} />
              <meshStandardMaterial color="#1e293b" roughness={0.9} />
            </mesh>
          ))}
        </group>

        {/* 16 Extruded Campus Buildings */}
        {nodes.map((node) => (
          <BuildingMesh
            key={node.code || node.hubId || node._id}
            node={node}
            isHovered={hoveredNode?.hubId === node.hubId}
            isSelected={selectedNode?.hubId === node.hubId}
            onHover={setHoveredNode}
            onClick={handleNodeClick}
          />
        ))}

        {/* Active Route Polylines & Markers */}
        {routePoints.length >= 2 && (
          <group>
            {/* Main Glowing Route Line */}
            <Line
              points={routePoints}
              color="#f97316"
              lineWidth={4.5}
            />

            {/* Subtle Ground Shadow for Line */}
            <Line
              points={routePoints.map((p) => [p[0], 0.04, p[2]])}
              color="#ea580c"
              lineWidth={2}
              opacity={0.4}
              transparent
            />

            {/* Numbered Waypoint Badges */}
            {routePoints.map((pt, idx) => (
              <group key={idx} position={pt}>
                <mesh position={[0, 0.3, 0]}>
                  <cylinderGeometry args={[0.2, 0.05, 0.6, 16]} />
                  <meshBasicMaterial color="#f97316" />
                </mesh>
                <Html position={[0, 1.2, 0]} center style={{ pointerEvents: 'none' }}>
                  <div className="w-5 h-5 rounded-full bg-orange-500 text-white font-black text-[10px] flex items-center justify-center border-2 border-white shadow-lg animate-pulse">
                    {idx + 1}
                  </div>
                </Html>
              </group>
            ))}

            {/* Animated Delivery Cart on Route */}
            <AnimatedVehicle points={routePoints} />
          </group>
        )}

        {/* Smooth OrbitControls (no clipping below ground) */}
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={10}
          maxDistance={80}
          maxPolarAngle={Math.PI / 2.2}
        />

        {/* Dynamic Camera Perspective Switcher */}
        <CameraManager viewPreset={viewPreset} controlsRef={controlsRef} />
      </Canvas>
    </div>
  );
};

export default CampusMap3D;
