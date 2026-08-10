'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SceneFrame, useSceneColors, useSettleFrames } from './frame';
import { buildGraph } from './graph';

/*
  The hero scene: a workspace as a living graph.

  People are spheres, the tools they work in are cubes, and the links between
  them carry pulses — the "commits, messages, task events" the copy talks
  about, drawn as something actually moving between the two ends. Everything
  orbits a wireframe core, which is the workspace itself.

  Built for a phone first: 22 nodes, two instanced meshes, one line buffer and
  no lights at all (basic materials are lit by their own colour), so the whole
  scene is a handful of draw calls.
*/

const PULSE_COUNT = 7;

function Constellation() {
  const colors = useSceneColors();
  const { nodes, edges, peopleCount, toolCount } = useMemo(() => buildGraph(), []);

  const group = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const peopleMesh = useRef<THREE.InstancedMesh>(null);
  const toolMesh = useRef<THREE.InstancedMesh>(null);
  const pulseMesh = useRef<THREE.InstancedMesh>(null);
  const lines = useRef<THREE.LineSegments>(null);

  const scratch = useMemo(() => new THREE.Object3D(), []);
  const live = useMemo(() => nodes.map((node) => node.base.clone()), [nodes]);
  const linePositions = useMemo(() => new Float32Array(edges.length * 6), [edges.length]);

  const pulses = useMemo(
    () =>
      Array.from({ length: PULSE_COUNT }, (_, i) => ({
        edge: Math.floor((i * 5 + 3) % edges.length),
        t: (i / PULSE_COUNT) % 1,
        speed: 0.35 + (i % 4) * 0.12,
      })),
    [edges.length],
  );

  const pointer = useThree((state) => state.pointer);

  const layout = useCallback((time: number, step: number) => {
    // Drift: each node breathes along its own radius on its own clock.
    nodes.forEach((node, i) => {
      const swell = 1 + Math.sin(time * node.speed + node.phase) * 0.075;
      live[i]!.copy(node.base).multiplyScalar(swell);
    });

    // People
    if (peopleMesh.current) {
      nodes.forEach((node, i) => {
        if (node.tool) return;
        scratch.position.copy(live[i]!);
        const pulse = 1 + Math.sin(time * 1.6 + node.phase) * 0.12;
        scratch.scale.setScalar(pulse);
        scratch.rotation.set(0, 0, 0);
        scratch.updateMatrix();
        peopleMesh.current!.setMatrixAt(node.slot, scratch.matrix);
      });
      peopleMesh.current.instanceMatrix.needsUpdate = true;
    }

    // Tools — the cubes, tumbling on two axes
    if (toolMesh.current) {
      nodes.forEach((node, i) => {
        if (!node.tool) return;
        scratch.position.copy(live[i]!);
        scratch.rotation.set(time * 0.6 + node.phase, time * 0.45 + node.phase, 0);
        scratch.scale.setScalar(1);
        scratch.updateMatrix();
        toolMesh.current!.setMatrixAt(node.slot, scratch.matrix);
      });
      toolMesh.current.instanceMatrix.needsUpdate = true;
    }

    // Links follow whatever the nodes just did.
    edges.forEach(([a, b], i) => {
      const from = live[a]!;
      const to = live[b]!;
      linePositions.set([from.x, from.y, from.z, to.x, to.y, to.z], i * 6);
    });
    if (lines.current) {
      const attribute = lines.current.geometry.getAttribute('position') as THREE.BufferAttribute;
      attribute.needsUpdate = true;
    }

    // Pulses travelling along the links.
    if (pulseMesh.current) {
      pulses.forEach((pulse, i) => {
        pulse.t += step * pulse.speed;
        if (pulse.t > 1) {
          pulse.t = 0;
          pulse.edge = Math.floor(Math.random() * edges.length);
        }
        const [a, b] = edges[pulse.edge]!;
        scratch.position.lerpVectors(live[a]!, live[b]!, pulse.t);
        // Fade in and out at the ends so they arrive rather than blink.
        scratch.scale.setScalar(Math.sin(pulse.t * Math.PI) * 1.1 + 0.15);
        scratch.rotation.set(0, 0, 0);
        scratch.updateMatrix();
        pulseMesh.current!.setMatrixAt(i, scratch.matrix);
      });
      pulseMesh.current.instanceMatrix.needsUpdate = true;
    }

    if (core.current) {
      core.current.rotation.y -= step * 0.25;
      core.current.rotation.x += step * 0.1;
    }
    if (ring.current) {
      ring.current.rotation.z += step * 0.3;
      ring.current.rotation.x = Math.sin(time * 0.35) * 0.4;
    }

    // Slow orbit, nudged by the pointer. Touch leaves the pointer at 0,0 until
    // the reader actually drags, so a phone just gets the orbit.
    if (group.current) {
      group.current.rotation.y += step * 0.14;
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, pointer.y * 0.28, 0.05);
      group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, pointer.x * 0.35, 0.05);
    }
  }, [edges, live, nodes, pointer, pulses, linePositions, scratch]);

  // A frozen scene still needs its opening pose drawn once.
  useSettleFrames(() => layout(0, 0));

  useFrame((state, delta) => {
    // A backgrounded tab hands back a huge delta; cap it so nothing teleports.
    layout(state.clock.elapsedTime, Math.min(delta, 0.05));
  });

  return (
    <group ref={group}>
      <instancedMesh ref={peopleMesh} args={[undefined, undefined, peopleCount]}>
        <sphereGeometry args={[0.105, 16, 16]} />
        <meshBasicMaterial color={colors.ink} />
      </instancedMesh>

      <instancedMesh ref={toolMesh} args={[undefined, undefined, toolCount]}>
        <boxGeometry args={[0.17, 0.17, 0.17]} />
        <meshBasicMaterial color={colors.ink} />
      </instancedMesh>

      <instancedMesh ref={pulseMesh} args={[undefined, undefined, PULSE_COUNT]}>
        <sphereGeometry args={[0.055, 10, 10]} />
        <meshBasicMaterial color={colors.ink} />
      </instancedMesh>

      <lineSegments ref={lines}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePositions, 3]} usage={THREE.DynamicDrawUsage} />
        </bufferGeometry>
        <lineBasicMaterial color={colors.line} transparent opacity={0.85} />
      </lineSegments>

      {/* The workspace at the centre: a wireframe core inside the Loop ring. */}
      <mesh ref={core}>
        <icosahedronGeometry args={[0.95, 1]} />
        <meshBasicMaterial color={colors.faint} wireframe />
      </mesh>
      <mesh ref={ring}>
        <torusGeometry args={[1.45, 0.012, 8, 90]} />
        <meshBasicMaterial color={colors.ink} />
      </mesh>
    </group>
  );
}

const CAMERA_CONFIG = { position: [0, 0, 8.0] as [number, number, number], fov: 45 };

export default function NetworkScene() {
  const colors = useSceneColors();
  // The camera sits back far enough that the shell still clears the frustum on
  // a portrait canvas, where the horizontal field is narrower than the vertical
  // one the fov describes.
  return (
    <SceneFrame camera={CAMERA_CONFIG}>
      {/* Fog in the page's own background colour: distant nodes recede
          instead of stacking into a flat cloud of dots. */}
      <fog attach="fog" args={[`#${colors.ground.getHexString()}`, 7.5, 15]} />
      <Constellation />
    </SceneFrame>
  );
}
