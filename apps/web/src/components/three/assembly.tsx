'use client';

import { useFrame } from '@react-three/fiber';
import { useCallback, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SceneFrame, useSceneColors, useSettleFrames } from './frame';

/*
  The scroll scene: twenty-seven scattered cubes becoming one solid block.

  It is the argument of the page in one object — six tools' worth of loose
  pieces pulled into a single workspace — and it is driven entirely by how far
  the reader has scrolled through the pinned section, so the assembly happens
  at their pace rather than on a timer.

  Progress arrives through a ref rather than a prop so scrolling never
  re-renders React; only the frame loop reads it.
*/

const GRID = 3;
const CELL = 0.63;
const COUNT = GRID ** 3;

/** Deterministic scatter — a fixed pseudo-random so every visit assembles the same way. */
function seeded(i: number, salt: number) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

interface Piece {
  home: THREE.Vector3;
  away: THREE.Vector3;
  spin: THREE.Euler;
  delay: number;
}

function usePieces() {
  return useMemo(() => {
    const pieces: Piece[] = [];
    let i = 0;
    for (let x = 0; x < GRID; x += 1) {
      for (let y = 0; y < GRID; y += 1) {
        for (let z = 0; z < GRID; z += 1) {
          const home = new THREE.Vector3((x - 1) * CELL, (y - 1) * CELL, (z - 1) * CELL);
          // Scatter outward along each piece's own direction, so the block
          // explodes rather than dissolving into a random cloud.
          const away = home
            .clone()
            .normalize()
            .multiplyScalar(2.6 + seeded(i, 1) * 1.7)
            .add(new THREE.Vector3(seeded(i, 2) - 0.5, seeded(i, 3) - 0.5, seeded(i, 4) - 0.5));
          // Depth is flattened deliberately. The camera sits at z=7.2, and a
          // piece thrown the full scatter distance towards the lens would end
          // up behind it — visibly clipping away instead of flying in.
          away.z *= 0.6;
          // The centre piece has no direction to travel along; give it one.
          if (away.lengthSq() < 0.01) away.set(0, 3.4, 0);
          pieces.push({
            home,
            away,
            spin: new THREE.Euler(seeded(i, 5) * 7, seeded(i, 6) * 7, seeded(i, 7) * 7),
            // Staggered arrival reads as assembly, not as one rigid snap.
            delay: seeded(i, 8) * 0.32,
            });
          i += 1;
        }
      }
    }
    return pieces;
  }, []);
}

function Block({ progress }: { progress: { current: number } }) {
  const colors = useSceneColors();
  const pieces = usePieces();

  const group = useRef<THREE.Group>(null);
  const solid = useRef<THREE.InstancedMesh>(null);
  const edges = useRef<THREE.InstancedMesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const scratch = useMemo(() => new THREE.Object3D(), []);

  const layout = useCallback((time: number, step: number) => {
    const p = THREE.MathUtils.clamp(progress.current, 0, 1);

    pieces.forEach((piece, i) => {
      // Each piece runs its own slightly-shifted copy of the timeline.
      const local = easeInOut(THREE.MathUtils.clamp((p - piece.delay) / (1 - piece.delay), 0, 1));
      scratch.position.lerpVectors(piece.away, piece.home, local);
      scratch.rotation.set(piece.spin.x * (1 - local), piece.spin.y * (1 - local), piece.spin.z * (1 - local));
      scratch.scale.setScalar(0.55 + local * 0.45);
      scratch.updateMatrix();
      solid.current?.setMatrixAt(i, scratch.matrix);

      // Same transform, a hair larger, so the outline never z-fights the face.
      scratch.scale.multiplyScalar(1.006);
      scratch.updateMatrix();
      edges.current?.setMatrixAt(i, scratch.matrix);
    });

    if (solid.current) solid.current.instanceMatrix.needsUpdate = true;
    if (edges.current) edges.current.instanceMatrix.needsUpdate = true;

    if (group.current) {
      // A full turn across the scroll, plus a slow idle so it is never frozen.
      group.current.rotation.y = p * Math.PI * 1.6 + time * 0.12;
      group.current.rotation.x = Math.sin(time * 0.25) * 0.16 + (1 - p) * 0.3;
    }

    if (ring.current) {
      ring.current.rotation.z += step * 0.4;
      // The Loop ring closes in only once the block is nearly whole.
      const reveal = THREE.MathUtils.smoothstep(p, 0.72, 1);
      ring.current.scale.setScalar(1.6 - reveal * 0.35);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = reveal;
    }
  }, [pieces, progress, scratch]);

  // Draws the opening pose, and catches the reduced-motion case where the
  // section pins progress to 1 just after this scene has mounted.
  useSettleFrames(() => layout(0, 0));

  useFrame((state, delta) => {
    layout(state.clock.elapsedTime, Math.min(delta, 0.05));
  });

  return (
    <group ref={group}>
      <instancedMesh ref={solid} args={[undefined, undefined, COUNT]}>
        <boxGeometry args={[CELL * 0.92, CELL * 0.92, CELL * 0.92]} />
        <meshBasicMaterial color={colors.ink} />
      </instancedMesh>

      <instancedMesh ref={edges} args={[undefined, undefined, COUNT]}>
        <boxGeometry args={[CELL * 0.92, CELL * 0.92, CELL * 0.92]} />
        <meshBasicMaterial color={colors.ground} wireframe />
      </instancedMesh>

      {/* Sized so the closing ring still fits a narrow portrait canvas. */}
      <mesh ref={ring} rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[1.7, 0.014, 8, 96]} />
        <meshBasicMaterial color={colors.ink} transparent opacity={0} />
      </mesh>
    </group>
  );
}

const CAMERA_CONFIG = { position: [0, 0, 8] as [number, number, number], fov: 42 };

export default function AssemblyScene({ progress }: { progress: { current: number } }) {
  const colors = useSceneColors();
  return (
    <SceneFrame camera={CAMERA_CONFIG}>
      <fog attach="fog" args={[`#${colors.ground.getHexString()}`, 6.5, 16]} />
      <Block progress={progress} />
    </SceneFrame>
  );
}
