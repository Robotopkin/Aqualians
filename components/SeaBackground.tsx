"use client";

import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, Triangle, Vec2 } from "ogl";

const RIPPLES = 6;

const fragment = /* glsl */ `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uWaveScale;
uniform float uWaveRatio;
uniform float uSwell;
uniform float uTurbulence;
uniform float uTilt;
uniform float uZoom;
uniform float uHeight;
uniform float uFogDepth;
uniform float uBrightness;
uniform float uBrush;
uniform float uStrength;
uniform float uSwirl;
uniform float uRings;
uniform float uSpread;
uniform float uFade;
uniform float uDispersion;
uniform float uGlint;
uniform float uTintAmount;
uniform float uClick;
uniform vec3 uR0;
uniform vec3 uR1;
uniform vec3 uR2;
uniform vec3 uR3;
uniform vec3 uR4;
uniform vec3 uR5;

vec3 gold = vec3(0.94, 0.83, 0.54);
vec3 pink = vec3(1.0, 0.75, 0.66);
vec3 cyan = vec3(0.55, 0.91, 1.0);

vec2 rippleOffset(vec2 px, vec3 ripple) {
  if (ripple.z < 0.0) return vec2(0.0);
  float age = uTime - ripple.z;
  if (age < 0.0 || age > uFade) return vec2(0.0);
  float life = age / uFade;
  vec2 delta = px - ripple.xy;
  float dist = length(delta);
  float radius = uBrush * uClick * (0.45 + (uSpread - 0.45) * life);
  float reach = 1.0 - smoothstep(radius * 0.15, radius, dist);
  if (reach <= 0.0) return vec2(0.0);
  float wave = sin(dist / max(uBrush, 1.0) * uRings * 6.2831853 - life * 9.0);
  float mask = reach * (1.0 - life);
  vec2 dir = delta / max(dist, 0.001);
  vec2 tang = vec2(-dir.y, dir.x);
  return (dir + tang * uSwirl) * wave * mask * uStrength * uBrush;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 offset = rippleOffset(px, uR0) + rippleOffset(px, uR1) + rippleOffset(px, uR2);
  offset += rippleOffset(px, uR3) + rippleOffset(px, uR4) + rippleOffset(px, uR5);
  vec2 samplePx = px + offset;
  vec2 p = (samplePx - vec2(uResolution.x * 0.5, uResolution.y)) / max(uResolution.y, 1.0);
  p /= max(uZoom * 0.34, 0.2);
  p.x += -p.y * (uTilt - 1.0) * 0.22;

  float depth = clamp(-p.y * max(uHeight, 0.4) * 0.55, 0.0, 4.0);
  float t = uTime * uSpeed;
  vec3 deep = vec3(0.004, 0.02, 0.04);
  vec3 surface = vec3(0.12, 0.42, 0.46);
  float reach = exp(-depth * (36.0 / max(uFogDepth, 1.0)));
  vec3 col = mix(deep, surface, reach);

  col += vec3(0.9, 0.97, 0.82) * exp(p.y * 6.0) * 0.28;

  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float sway = sin(t * 0.32 + fi * 1.4) * (0.045 + uTurbulence * 0.00035);
    float origin = (fi - 3.0) * 0.28 * uWaveScale + sway;
    float lean = sin(t * 0.18 + fi) * 0.06;
    float across = p.x - origin - lean * (-p.y);
    float width = 0.010 + uWaveRatio * 0.012;
    float beam = exp(-across * across / max(width, 0.003));
    beam *= exp(-depth * (10.0 / max(uFogDepth, 1.0)));
    beam *= 0.62 + 0.38 * sin((-p.y) * (1.6 + uSwell * 0.015) - t * 1.3 + fi);
    vec3 tint = mix(gold, cyan, 0.3 + 0.7 * sin(fi * 1.6));
    tint = mix(tint, pink, 0.34);
    col += tint * beam * (0.18 + uAmplitude * 0.07);
  }

  vec2 q = p * (2.2 * uWaveScale);
  q += vec2(sin(t + q.y), cos(t * 0.8 + q.x)) * (uTurbulence / 70.0);
  float cau = sin(q.x * 3.1 + t) * sin(q.y * 2.5 - t * 0.7);
  cau = smoothstep(0.2, 0.92, cau * 0.5 + 0.5);
  col += mix(gold, mix(cyan, pink, 0.45), 0.5) * cau * 0.07 * (1.0 - reach);

  col *= uBrightness;
  float crest = length(offset) / max(uBrush, 1.0);
  float split = uDispersion * 0.05 * crest;
  col.r += split * gold.r;
  col.b += split * cyan.b;
  col += mix(gold, cyan, 0.5) * crest * uGlint;
  col = mix(col, mix(gold, cyan, 0.35), clamp(crest * uTintAmount, 0.0, 0.35));
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const vertex = /* glsl */ `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export default function SeaBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new Renderer({
      dpr: 1,
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      webgl: 1,
    });
    const gl = renderer.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0.01, 0.04, 0.07, 1);
    Object.assign(gl.canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      display: "block",
    });
    container.appendChild(gl.canvas);

    const resolution = new Vec2(1, 1);
    const rippleValue = Array.from({ length: RIPPLES }, () => new Float32Array([0, 0, -1]));
    const rippleUniforms = Object.fromEntries(rippleValue.map((value, index) => [`uR${index}`, { value }]));
    const program = new Program(gl, {
      vertex,
      fragment,
      depthTest: false,
      depthWrite: false,
      cullFace: false,
      uniforms: {
        uResolution: { value: resolution },
        uTime: { value: 0 },
        uSpeed: { value: 0.35 },
        uAmplitude: { value: 2.15 },
        uWaveScale: { value: 0.7 },
        uWaveRatio: { value: 0.5 },
        uSwell: { value: 40 },
        uTurbulence: { value: 60 },
        uTilt: { value: 1.3 },
        uZoom: { value: 2.5 },
        uHeight: { value: 2 },
        uFogDepth: { value: 37 },
        uBrightness: { value: 1.25 },
        uBrush: { value: 430 },
        uStrength: { value: 0.065 },
        uSwirl: { value: 0.65 },
        uRings: { value: 4 },
        uSpread: { value: 3 },
        uFade: { value: 5 },
        uDispersion: { value: 1 },
        uGlint: { value: 0.25 },
        uTintAmount: { value: 0.1 },
        uClick: { value: 1.4 },
        ...rippleUniforms,
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    const resize = () => {
      const width = window.innerWidth || container.clientWidth || 1;
      const height = window.innerHeight || container.clientHeight || 1;
      renderer.setSize(width, height);
      resolution.set(gl.drawingBufferWidth, gl.drawingBufferHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    window.addEventListener("resize", resize);
    resize();

    let slot = 0;
    const onPress = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const rect = gl.canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (gl.drawingBufferWidth / Math.max(rect.width, 1));
      const y = (rect.bottom - event.clientY) * (gl.drawingBufferHeight / Math.max(rect.height, 1));
      const ripple = rippleValue[slot];
      if (!ripple) return;
      ripple[0] = x;
      ripple[1] = y;
      ripple[2] = program.uniforms.uTime.value as number;
      slot = (slot + 1) % RIPPLES;
    };
    window.addEventListener("pointerdown", onPress);

    let raf = 0;
    let failed = false;
    const started = performance.now();
    const frame = (now: number) => {
      if (failed) return;
      program.uniforms.uTime.value = reduce ? 0 : (now - started) / 1000;
      try {
        renderer.render({ scene: mesh });
      } catch {
        failed = true;
        gl.canvas.style.display = "none";
        return;
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", onPress);
      if (gl.canvas.parentElement === container) container.removeChild(gl.canvas);
    };
  }, []);

  return <div className="sea-bg" ref={ref} aria-hidden />;
}
