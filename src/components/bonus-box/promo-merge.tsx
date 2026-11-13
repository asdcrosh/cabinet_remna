"use client";

// Объединение промокодов из рулетки: панель с кнопкой, лист выбора и полноэкранное слияние.
// Вид и анимация — по утверждённому прототипу StealthNet (design/promo-merge-prototype.html).
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check, Clock3, Copy, Crown, GitMerge, LoaderCircle, Percent } from "lucide-react";
import { apiFetch, isApiFetchError } from "@/lib/api-client";
import { toast } from "@/components/ui/toaster";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { formatDateOnly } from "@/components/bonus-box/bonus-box-display";
import type {
  PromoMergeCodeView,
  PromoMergeResponse,
  PromoMergeView,
} from "@/components/bonus-box/bonus-box-types";

type Rarity = PromoMergeCodeView["rarity"];

const RARITY_COLOR: Record<Rarity, string> = {
  COMMON: "#9CA3AF",
  RARE: "#22D3EE",
  EPIC: "#E879F9",
  LEGENDARY: "#FBBF24",
};
const RARITY_LABEL: Record<Rarity, string> = {
  COMMON: "Обычный",
  RARE: "Редкий",
  EPIC: "Особый",
  LEGENDARY: "Главный",
};
const PALETTE: Record<Rarity, string[]> = {
  COMMON: ["#9CA3AF", "#E5E7EB", "#34D399"],
  RARE: ["#22D3EE", "#A5F3FC", "#34D399", "#ffffff"],
  EPIC: ["#E879F9", "#F5D0FE", "#A78BFA", "#ffffff"],
  LEGENDARY: ["#FBBF24", "#FDE68A", "#FFF7CC", "#F59E0B"],
};

export function calculateMergedPercent(percents: number[], coefficientPercent: number, capPercent: number) {
  if (percents.length === 0) return 0;
  const best = Math.max(...percents);
  const sum = percents.reduce((total, value) => total + value, 0);
  return Math.min(capPercent, Math.max(best, Math.floor((sum * coefficientPercent) / 100)));
}

function mergedRarity(percent: number, capPercent: number): Rarity {
  if (percent >= capPercent) return "LEGENDARY";
  if (percent >= 20) return "EPIC";
  if (percent >= 10) return "RARE";
  return "COMMON";
}

function shortDate(iso: string) {
  const date = new Date(iso);
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function daysLeft(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function codesWord(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "код";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "кода";
  return "кодов";
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function PromoMergePanel({
  merge,
  onMerged,
}: {
  merge: PromoMergeView;
  onMerged: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [animation, setAnimation] = useState<{ sources: PromoMergeCodeView[]; result: PromoMergeResponse } | null>(null);
  const idempotencyKey = useRef<string>("");

  const mergeableCount = merge.codes.filter((code) => code.mergeable).length;
  const selectedCodes = merge.codes.filter((code) => selected.includes(code.id));
  const percents = selectedCodes.map((code) => code.discountPercent);
  const ready = selectedCodes.length >= merge.minCodes;
  const result = ready ? calculateMergedPercent(percents, merge.coefficientPercent, merge.capPercent) : 0;
  const best = percents.length ? Math.max(...percents) : 0;
  const sum = percents.reduce((total, value) => total + value, 0);
  const resultRarity = mergedRarity(result, merge.capPercent);
  const newExpiry = new Date(Date.now() + merge.ttlDays * 86_400_000).toISOString();

  if (!merge.enabled) return null;

  function openSheet() {
    idempotencyKey.current = crypto.randomUUID();
    setSelected([]);
    setOpen(true);
  }

  function toggle(code: PromoMergeCodeView) {
    if (!code.mergeable) {
      toast(code.reason === "AT_CAP" ? "Этот код уже сильнее любого объединения" : "Этот код нельзя объединить", "error");
      return;
    }
    setSelected((current) => {
      if (current.includes(code.id)) return current.filter((id) => id !== code.id);
      if (current.length >= merge.maxCodes) {
        toast(`Можно выбрать не больше ${merge.maxCodes} кодов`, "error");
        return current;
      }
      return [...current, code.id];
    });
  }

  async function submit() {
    if (!ready || submitting) return;
    setSubmitting(true);
    try {
      const response = await apiFetch<PromoMergeResponse>("/api/bonus-box/promo-merge", {
        method: "POST",
        body: JSON.stringify({ promoCodeIds: selected, idempotencyKey: idempotencyKey.current }),
      });
      setOpen(false);
      setAnimation({ sources: selectedCodes, result: response });
    } catch (error) {
      // Текст ошибки уже показан клиентом API; список кодов обновляем — какой-то из них мог стать недоступен.
      if (!isApiFetchError(error)) toast("Не удалось объединить промокоды", "error");
      await onMerged();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="promo-merge-panel order-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-950 dark:text-white sm:text-lg">Объединение промокодов</h2>
          <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
            {merge.canMerge
              ? `Несколько кодов → один сильнее, до −${merge.capPercent}%, на ${merge.ttlDays} дней`
              : `Нужно от ${merge.minCodes} кодов из рулетки ниже ${merge.capPercent}%`}
          </p>
        </div>
        <button
          type="button"
          className="btn-primary min-h-11 shrink-0 justify-center gap-2"
          disabled={!merge.canMerge}
          onClick={openSheet}
        >
          <GitMerge className="h-4 w-4" />
          Объединить коды{mergeableCount > 0 ? ` · ${mergeableCount}` : ""}
        </button>
      </section>

      <Modal
        open={open}
        title="Объединить промокоды"
        description={`Выберите от ${merge.minCodes} до ${merge.maxCodes} кодов`}
        onClose={() => !submitting && setOpen(false)}
        variant="sheet"
        panelClassName="promo-merge-sheet"
        footer={
          <div className="w-full space-y-2">
            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              Выбранные коды перестанут действовать. Отменить нельзя.
            </p>
            <button
              type="button"
              className="btn-primary min-h-12 w-full justify-center gap-2"
              disabled={!ready || submitting}
              onClick={submit}
            >
              {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
              {ready ? `Объединить · ${selectedCodes.length} ${codesWord(selectedCodes.length)}` : `Выберите ${merge.minCodes} кода`}
            </button>
          </div>
        }
      >
        <div className="promo-merge-grid">
          {merge.codes.map((code) => {
            const isSelected = selected.includes(code.id);
            const left = daysLeft(code.expiresAt);
            return (
              <button
                key={code.id}
                type="button"
                className={cn("promo-merge-tile", !code.mergeable && "is-max", isSelected && "is-selected")}
                style={{ "--rc": RARITY_COLOR[code.rarity] } as CSSProperties}
                aria-pressed={isSelected}
                aria-label={`Промокод минус ${code.discountPercent} процентов`}
                onClick={() => toggle(code)}
              >
                <span className="promo-merge-check" aria-hidden="true">
                  {code.mergeable ? <Check className="h-3 w-3" /> : <Crown className="h-3.5 w-3.5" />}
                </span>
                <b>−{code.discountPercent}%</b>
                <span className={cn(code.mergeable && left <= 1 && "is-urgent")}>
                  {!code.mergeable
                    ? code.reason === "AT_CAP" ? "Максимум" : "Нельзя"
                    : left <= 1 ? "сгорит завтра" : `до ${shortDate(code.expiresAt)}`}
                </span>
              </button>
            );
          })}
        </div>

        <div className="promo-merge-calc" style={{ "--rc": RARITY_COLOR[resultRarity] } as CSSProperties}>
          <div className="flex items-center justify-between gap-3">
            <div className="promo-merge-sum">
              {percents.length === 0 ? (
                <span className="text-slate-400">Выберите коды</span>
              ) : (
                <>
                  {percents.map((percent, index) => (
                    <span key={index} style={{ color: RARITY_COLOR[mergedRarity(percent, merge.capPercent)] }}>
                      {index > 0 && <i>+</i>}
                      {percent}
                    </span>
                  ))}
                  {ready && <i>= {sum} × {String(merge.coefficientPercent / 100).replace(".", ",")}</i>}
                </>
              )}
            </div>
            <div className="promo-merge-result">
              <b>{ready ? `−${result}%` : "—"}</b>
              <span>{ready ? RARITY_LABEL[resultRarity] : `нужно ${merge.minCodes} кода`}</span>
            </div>
          </div>
          <div className="promo-merge-meter" aria-hidden="true">
            <i style={{ width: `${ready ? (result / merge.capPercent) * 100 : 0}%` }} />
            {ready && <span style={{ left: `${(best / merge.capPercent) * 100}%` }} />}
          </div>
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>0%</span>
            <span>{ready && result > best ? `+${result - best}% к лучшему коду` : ""}</span>
            <span>потолок {merge.capPercent}%</span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Clock3 className="h-4 w-4 text-emerald-500" />
            {ready
              ? <span>Новый код до <b>{formatDateOnly(newExpiry)}</b>, только для вас</span>
              : <span>Новый код будет действовать {merge.ttlDays} дней</span>}
          </div>
        </div>
      </Modal>

      {animation && (
        <PromoMergeAnimation
          sources={animation.sources}
          result={animation.result}
          capPercent={merge.capPercent}
          onDone={async () => {
            setAnimation(null);
            await onMerged();
          }}
        />
      )}
    </>
  );
}

/* ---------- полноэкранное слияние ---------- */

type Particle = {
  shape: "pull" | "spark" | "ring" | "confetti" | "star" | "coin" | "ember";
  x: number; y: number; vx: number; vy: number; g: number;
  life: number; max: number; c: string; drag: number;
  rot?: number; vr?: number; sz?: number; r?: number;
  sx?: number; sy?: number; tx?: number; ty?: number; cx?: number; cy?: number; px?: number; py?: number;
};

function createFx(canvas: HTMLCanvasElement) {
  const ps: Particle[] = [];
  let running = false;
  let last = 0;
  let flash = 0;
  let embers: string[] | null = null;
  let stopped = false;

  function tick(now: number) {
    if (stopped) return;
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    const x = canvas.getContext("2d");
    if (!x) return;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    if (embers && Math.random() < 0.35) {
      ps.push({ shape: "ember", x: Math.random() * W, y: H + 8, vx: (Math.random() - 0.5) * 20, vy: -(40 + Math.random() * 60), g: 0, life: 0, max: 4 + Math.random() * 2, c: embers[Math.floor(Math.random() * embers.length)]!, drag: 1, rot: Math.random() * 7, sz: 1.5 + Math.random() * 2 });
    }
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]!;
      p.life += dt;
      if (p.life >= p.max || p.y > H + 40) { ps.splice(i, 1); continue; }
      const a = 1 - p.life / p.max;
      x.save();
      if (p.shape === "pull") {
        const t = Math.pow(p.life / p.max, 2);
        const u = 1 - t;
        p.px = p.x; p.py = p.y;
        p.x = u * u * p.sx! + 2 * u * t * p.cx! + t * t * p.tx!;
        p.y = u * u * p.sy! + 2 * u * t * p.cy! + t * t * p.ty!;
        x.globalCompositeOperation = "lighter";
        x.strokeStyle = p.c; x.globalAlpha = Math.min(1, (1 - a) * 3) * 0.9; x.lineWidth = 2; x.lineCap = "round";
        x.shadowColor = p.c; x.shadowBlur = 8;
        x.beginPath(); x.moveTo(p.px, p.py); x.lineTo(p.x, p.y); x.stroke();
        x.restore();
        continue;
      }
      const k = Math.pow(p.drag, dt * 60);
      p.vx *= k; p.vy = p.vy * k + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot = (p.rot ?? 0) + (p.vr ?? 0) * dt;
      const sz = p.sz ?? 2;
      if (p.shape === "spark") {
        x.globalCompositeOperation = "lighter"; x.strokeStyle = p.c; x.globalAlpha = a; x.lineWidth = 2.2; x.lineCap = "round";
        x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); x.stroke();
      } else if (p.shape === "ring") {
        const e = 1 - Math.pow(1 - p.life / p.max, 3);
        x.strokeStyle = p.c; x.globalAlpha = a * 0.9; x.lineWidth = 1 + 5 * a; x.shadowColor = p.c; x.shadowBlur = 18;
        x.beginPath(); x.arc(p.x, p.y, 30 + e * (p.r ?? 200), 0, 7); x.stroke();
      } else if (p.shape === "confetti") {
        x.translate(p.x, p.y); x.rotate(p.rot!); x.scale(1, Math.cos(p.rot! * 1.7)); x.globalAlpha = Math.min(1, a * 2);
        x.fillStyle = p.c; x.fillRect(-sz / 2, -sz, sz, sz * 2);
      } else if (p.shape === "coin") {
        x.translate(p.x, p.y); x.scale(Math.max(0.15, Math.abs(Math.cos(p.rot!))), 1); x.globalAlpha = Math.min(1, a * 2.5);
        const g = x.createLinearGradient(-sz, -sz, sz, sz);
        g.addColorStop(0, "#FFF7CC"); g.addColorStop(0.5, "#FBBF24"); g.addColorStop(1, "#B45309");
        x.fillStyle = g; x.beginPath(); x.arc(0, 0, sz, 0, 7); x.fill();
      } else if (p.shape === "star") {
        x.globalCompositeOperation = "lighter"; x.translate(p.x, p.y); x.rotate(p.rot! * 0.2);
        const s2 = sz * (0.6 + 0.4 * Math.sin(p.life * 14));
        x.globalAlpha = a; x.fillStyle = p.c; x.beginPath();
        for (let j = 0; j < 8; j++) { const rr = j % 2 ? s2 * 0.28 : s2; const an = (j * Math.PI) / 4; x.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
        x.closePath(); x.fill();
      } else if (p.shape === "ember") {
        x.globalCompositeOperation = "lighter";
        const tw = 0.5 + 0.5 * Math.sin(p.life * 6 + p.rot!);
        x.globalAlpha = Math.min(1, p.life) * a * tw;
        const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz * 4);
        g.addColorStop(0, p.c); g.addColorStop(1, "rgba(0,0,0,0)");
        x.fillStyle = g; x.fillRect(p.x - sz * 4, p.y - sz * 4, sz * 8, sz * 8);
      }
      x.restore();
    }
    if (flash > 0) {
      x.fillStyle = `rgba(255,250,235,${flash})`; x.fillRect(0, 0, W, H);
      flash = Math.max(0, flash - dt * 2.4);
    }
    if (ps.length || embers || flash > 0) requestAnimationFrame(tick);
    else { x.clearRect(0, 0, W, H); running = false; }
  }
  function start() {
    if (running) return;
    running = true; last = performance.now(); requestAnimationFrame(tick);
  }
  function add(p: Particle) { ps.push(p); start(); }

  return {
    burst(x: number, y: number, n: number, pal: string[], o: { sp: number; shape: Particle["shape"]; life: number; g?: number; up?: number }) {
      const r0 = o.shape === "star" ? 100 : o.shape === "spark" ? 60 : 50;
      for (let i = 0; i < n; i++) {
        const an = Math.random() * Math.PI * 2;
        const sp = o.sp * (0.35 + Math.random() * 0.75);
        add({
          shape: o.shape, x: x + Math.cos(an) * r0, y: y + Math.sin(an) * r0 * 1.1,
          vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - (o.up ?? 0) * Math.random(), g: o.g ?? 0,
          life: 0, max: o.life * (0.6 + Math.random() * 0.6), c: pal[i % pal.length]!,
          rot: Math.random() * 7, vr: (Math.random() - 0.5) * 14,
          sz: o.shape === "coin" ? 6 + Math.random() * 3 : o.shape === "confetti" ? 5 + Math.random() * 4 : o.shape === "star" ? 4 + Math.random() * 5 : 2,
          drag: o.shape === "spark" ? 0.9 : o.shape === "star" ? 0.93 : 0.985,
        });
      }
    },
    ring(x: number, y: number, c: string, r: number, d: number) {
      add({ shape: "ring", x, y, vx: 0, vy: 0, g: 0, life: 0, max: d, c, r, drag: 1 });
    },
    pull(x: number, y: number, tx: number, ty: number, c: string, n: number) {
      for (let i = 0; i < n; i++) {
        const an = Math.random() * Math.PI * 2;
        const d = 10 + Math.random() * 26;
        const sx = x + Math.cos(an) * d;
        const sy = y + Math.sin(an) * d;
        const s = (Math.random() - 0.5) * 0.8;
        add({
          shape: "pull", x: sx, y: sy, sx, sy, tx, ty,
          cx: (sx + tx) / 2 - (ty - sy) * s, cy: (sy + ty) / 2 + (tx - sx) * s,
          vx: 0, vy: 0, g: 0, life: 0, max: 0.35 + Math.random() * 0.3, c, drag: 1,
        });
      }
    },
    flash(v: number) { flash = v; start(); },
    embers(pal: string[] | null) { embers = pal; if (pal) start(); },
    stop() { stopped = true; ps.length = 0; },
  };
}

function backOut(x: number) {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
}

function PromoMergeAnimation({
  sources,
  result,
  capPercent,
  onDone,
}: {
  sources: PromoMergeCodeView[];
  result: PromoMergeResponse;
  capPercent: number;
  onDone: () => void;
}) {
  const reduce = useMemo(prefersReducedMotion, []);
  const [phase, setPhase] = useState<"gather" | "result">(reduce ? "result" : "gather");
  const [shake, setShake] = useState(false);
  const [count, setCount] = useState(reduce ? result.promoCode.discountPercent : result.bestSourcePercent);
  const [leaving, setLeaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rarity = mergedRarity(result.promoCode.discountPercent, capPercent);
  const color = RARITY_COLOR[rarity];
  const big = rarity === "EPIC" || rarity === "LEGENDARY";
  const title = rarity === "LEGENDARY" ? "МАКСИМУМ!" : "Скидка усилена!";

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root || reduce) return;
    const fx = createFx(canvas);
    const timers: number[] = [];
    let frame = 0;
    const W = root.clientWidth;
    const CX = W / 2;
    const CY = Math.min(300, root.clientHeight * 0.36);
    const n = sources.length;
    const R = Math.min(150, W * 0.3);
    const POP = 520;
    const SPIN = 1250;
    const t0 = performance.now();
    let lastEmit = 0;

    const step = (now: number) => {
      const t = now - t0;
      const k = Math.min(1, Math.max(0, (t - POP) / SPIN));
      const ek = k * k * k;
      const emit = k > 0 && now - lastEmit > 34;
      tileRefs.current.forEach((el, i) => {
        if (!el) return;
        const base = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const pop = Math.min(1, Math.max(0, (t - i * 80) / 360));
        const ang = base + k * k * 4.2 * Math.PI + (1 - pop) * 0.6;
        const r = R * (1 - ek) * (0.6 + 0.4 * pop);
        const sc = (0.4 + 0.6 * backOut(pop)) * (1 - 0.62 * ek);
        const x = CX + Math.cos(ang) * r;
        const y = CY + Math.sin(ang) * r;
        el.style.transform = `translate(${x}px, ${y}px) rotate(${(ang - base) * 9}deg) scale(${sc})`;
        el.style.opacity = String(Math.min(pop * 1.6, 1) * (k > 0.82 ? Math.max(0, 1 - (k - 0.82) / 0.18) : 1));
        if (emit && k < 0.95) fx.pull(x, y, CX, CY, RARITY_COLOR[sources[i]!.rarity], 2);
      });
      if (emit) lastEmit = now;
      const core = coreRef.current;
      if (core) {
        core.style.opacity = String(Math.min(1, k * 1.4));
        core.style.transform = `scale(${(0.15 + 1.25 * k * k) * (1 + Math.sin(t / 70) * 0.06 * k)})`;
      }
      if (t < POP + SPIN) {
        frame = requestAnimationFrame(step);
        return;
      }
      const pal = PALETTE[rarity];
      fx.flash(0.85);
      setShake(true);
      fx.ring(CX, CY, color, 240, 0.8);
      fx.ring(CX, CY, "#ffffff", 150, 0.55);
      fx.burst(CX, CY, 56, pal, { sp: 700, shape: "spark", life: 0.85 });
      setPhase("result");
      timers.push(window.setTimeout(() => fx.burst(CX, CY, 22, pal, { sp: 260, shape: "star", life: 1.3 }), big ? 700 : 400));
      if (big) timers.push(window.setTimeout(() => fx.burst(CX, CY, 70, pal, { sp: 560, shape: "confetti", life: 2.6, g: 820, up: 260 }), 600));
      if (rarity === "LEGENDARY") {
        timers.push(window.setTimeout(() => fx.burst(CX, CY, 40, pal, { sp: 600, shape: "coin", life: 3, g: 1000, up: 420 }), 650));
        timers.push(window.setTimeout(() => fx.embers(pal), 1200));
      }
      const from = result.bestSourcePercent;
      const to = result.promoCode.discountPercent;
      timers.push(window.setTimeout(() => {
        const c0 = performance.now();
        const countStep = (cn: number) => {
          const p = Math.min(1, (cn - c0) / 700);
          setCount(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
          if (p < 1) frame = requestAnimationFrame(countStep);
        };
        frame = requestAnimationFrame(countStep);
      }, big ? 520 : 260));
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      timers.forEach((id) => window.clearTimeout(id));
      fx.stop();
    };
  }, [big, color, rarity, reduce, result, sources]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") finish(); };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish() {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onDone, reduce ? 0 : 250);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.promoCode.code);
      toast("Промокод скопирован", "success");
    } catch {
      toast("Не удалось скопировать промокод", "error");
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={rootRef}
      className={cn("promo-merge-stage", shake && "is-shaking", leaving && "is-leaving")}
      style={{ "--rc": color } as CSSProperties}
      role="dialog"
      aria-modal="true"
      aria-label="Объединение промокодов"
    >
      {phase === "gather" && (
        <>
          <div ref={coreRef} className="promo-merge-core" />
          {sources.map((code, index) => (
            <div
              key={code.id}
              ref={(el) => { tileRefs.current[index] = el; }}
              className="promo-merge-flytile"
              style={{ "--rc": RARITY_COLOR[code.rarity], opacity: 0 } as CSSProperties}
            >
              <b>−{code.discountPercent}%</b>
              <span>до {shortDate(code.expiresAt)}</span>
            </div>
          ))}
          <div className="promo-merge-label">Объединяем {sources.length} {codesWord(sources.length)}</div>
        </>
      )}
      {phase === "result" && (
        <>
          {big && <div className="promo-merge-rays" />}
          {rarity === "LEGENDARY" && <div className="promo-merge-rays is-second" />}
          <div className="promo-merge-result-wrap">
            <div className={cn("promo-merge-card", big && "is-flip")}>
              <Percent className="h-10 w-10" />
              <b>−{count}%</b>
              <small>промокод</small>
            </div>
            <span className="promo-merge-chip">
              <i />
              {RARITY_LABEL[rarity]} <s>было −{result.bestSourcePercent}%</s>
            </span>
            <h3 className={cn("promo-merge-title", rarity === "LEGENDARY" && "is-gold")}>
              {Array.from(title).map((ch, i) => (
                <span key={i} style={{ animationDelay: `${(big ? 0.55 : 0.35) + i * 0.035}s` }}>
                  {ch === " " ? " " : ch}
                </span>
              ))}
            </h3>
            <p className="promo-merge-sub">
              Действует до {formatDateOnly(result.promoCode.expiresAt)} и только для вас
            </p>
            <div className="promo-merge-code">
              <code>{result.promoCode.code}</code>
              <button type="button" onClick={copy}>
                <Copy className="h-4 w-4" />
                Копировать
              </button>
            </div>
            <button type="button" className="promo-merge-done" onClick={finish} autoFocus>
              Готово
            </button>
          </div>
        </>
      )}
      <canvas ref={canvasRef} className="promo-merge-fx" aria-hidden="true" />
    </div>,
    document.body,
  );
}
