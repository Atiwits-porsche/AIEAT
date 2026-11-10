import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, MEALS, type BodyScan, type Meal, type Profile, type WeightLog } from '../lib/db'
import { ageOf, fmt1, fmtInt } from '../lib/calc'
import { fatScale } from '../lib/body'
import type { Limits } from '../lib/nutrition'
import { formatThaiDate, todayStr } from '../lib/date'
import {
  bri, briScale, dayTip, gradeOf, weakestPart, rfm, waistLimit, waistLogs, waistScale, whtr, whtrScale,
  PROTEIN_PER_MEAL, VF_GOAL,
  type Adaptation, type Consistency, type DayQuality, type Finding, type LossRate, type Plateau, type Timing,
} from '../lib/quality'
import RangeBar from './RangeBar'
import { C, Legend, TipRow, Tooltip, linePath, niceTicks, shortDate, useWidth, xLabelIdx } from './Charts'

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function Sources({ items }: { items: string[] }) {
  return (
    <details className="mt-3 text-xs text-slate-600">
      <summary className="cursor-pointer font-medium text-slate-700">📚 เกณฑ์และที่มา</summary>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">{items.map((t) => <li key={t}>{t}</li>)}</ul>
    </details>
  )
}

const sign = (x: number, d = 1) => `${x > 0 ? '+' : ''}${x.toFixed(d)}`

// ============================ รูปร่าง ============================

export function WaistCard({ profile }: { profile: Profile }) {
  const weights = useLiveQuery(() => db.weights.toArray(), [])
  const scans = useLiveQuery(() => db.bodyScans.orderBy('date').reverse().limit(1).toArray(), [])
  const [value, setValue] = useState('')
  if (!weights) return null
  const logs = waistLogs(weights)
  const cur = logs[logs.length - 1]
  const first = logs[0]
  const h = profile.heightCm
  const today = todayStr()

  async function save() {
    const n = Number(value)
    if (!(n >= 40 && n <= 200)) return
    const log = weights!.find((w) => w.date === today)
    await db.weights.put({ ...(log ?? { date: today }), date: today, waistCm: Math.round(n * 10) / 10 } as WeightLog)
    setValue('')
  }

  const input = (
    <div className="mt-3 flex gap-2">
      <input type="number" inputMode="decimal" step="0.1" placeholder="รอบเอววันนี้ (ซม.)" value={value}
        onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()}
        className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-base outline-none focus:border-emerald-500" />
      <button onClick={save} aria-label="บันทึกรอบเอว" className="rounded-xl bg-emerald-600 px-4 font-semibold text-white">บันทึก</button>
    </div>
  )

  if (!cur) {
    return (
      <Card title="📏 รอบเอวและดัชนีรูปร่าง">
        <p className="text-sm text-slate-600">
          บันทึกรอบเอวเพื่อดู <b>รอบเอว/ส่วนสูง (WHtR)</b>, <b>% ไขมันประมาณ (RFM)</b> และ <b>Body Roundness Index (BRI)</b> —
          บอกไขมันหน้าท้องได้ดีกว่า BMI และบางครั้งเอวลดทั้งที่น้ำหนักนิ่ง
        </p>
        <p className="mt-2 text-xs text-slate-500">วิธีวัด: ตอนเช้าก่อนกินอาหาร ยืนตรง หายใจออกปกติ วัดรอบระดับสะดือ สายวัดขนานพื้นไม่รัดแน่น · สัปดาห์ละครั้ง</p>
        {input}
      </Card>
    )
  }

  const w = cur.waistCm
  const ratio = whtr(w, h)
  const r = rfm(profile.sex, w, h)
  const b = bri(w, h)
  const lim = waistLimit(profile.sex, h)
  const scan = scans?.[0] as BodyScan | undefined
  const recent = logs.slice(-6).reverse()

  return (
    <Card title="📏 รอบเอวและดัชนีรูปร่าง" right={<span className="text-xs text-slate-500">วัดล่าสุด {formatThaiDate(cur.date)}</span>}>
      <div className="space-y-5">
        <RangeBar label="รอบเอว" value={w} unit="ซม." scale={waistScale(profile.sex, h)}
          sub={`เกณฑ์คนไทย: ${profile.sex === 'male' ? 'ชาย < 90' : 'หญิง < 80'} ซม. และไม่เกินส่วนสูง ÷ 2 → ของคุณ ≤ ${fmt1(lim)} ซม.${w > lim ? ` (ต้องลดอีก ${fmt1(w - lim)} ซม.)` : ''}`} />
        <RangeBar label="รอบเอว ÷ ส่วนสูง (WHtR)" value={ratio} unit="" digits={2} scale={whtrScale} ticks={[0.4, 0.5, 0.6]}
          sub={ratio >= 0.5 ? `ให้ต่ำกว่า 0.5 ต้องเหลือรอบเอว < ${fmt1(h / 2)} ซม.` : 'ไขมันหน้าท้องอยู่ในเกณฑ์ดี'} />
        <RangeBar label="% ไขมันประมาณ (RFM)" value={r} unit="%" scale={fatScale(profile.sex, ageOf(profile.birthYear))}
          sub={scan ? `เครื่องวัด (${formatThaiDate(scan.date)}): ${fmt1(scan.fatPct)}% · ต่างกัน ${sign(r - scan.fatPct)} — ใช้ดูแนวโน้มของตัวเอง` : 'คำนวณจากส่วนสูงกับรอบเอว ไม่ต้องมีเครื่องวัด'} />
        <RangeBar label="Body Roundness Index (BRI)" value={b} unit="" digits={2} scale={briScale} ticks={[3.41, 5.46, 6.91]}
          sub="ความกลมของลำตัว · ช่วง 3.4–5.5 สัมพันธ์กับความเสี่ยงต่ำสุดในงานวิจัย" />
      </div>

      {logs.length >= 2 && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">ประวัติรอบเอว</span>
            <span className={w <= first.waistCm ? 'text-emerald-700' : 'text-amber-700'}>
              ตั้งแต่ {formatThaiDate(first.date)}: {sign(w - first.waistCm)} ซม.
            </span>
          </div>
          <ul className="mt-1 divide-y divide-slate-100 text-sm">
            {recent.map((x, i) => {
              const prev = recent[i + 1]
              return (
                <li key={x.date} className="flex justify-between py-1">
                  <span className="text-slate-600">{formatThaiDate(x.date)}</span>
                  <span>
                    {fmt1(x.waistCm)} ซม.
                    {prev && <span className={`ml-2 text-xs ${x.waistCm <= prev.waistCm ? 'text-emerald-700' : 'text-amber-700'}`}>{sign(x.waistCm - prev.waistCm)}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {input}
      <Sources items={[
        'WHtR: NICE (สหราชอาณาจักร) 0.4–0.49 ปกติ · 0.5–0.59 เพิ่มความเสี่ยง · ≥ 0.6 สูง ใช้ได้ทุกเพศและเชื้อชาติ (สอดคล้องกับ กรมอนามัย “รอบเอวไม่เกินส่วนสูงหาร 2”)',
        'รอบเอวคนไทย: ชาย < 90 ซม., หญิง < 80 ซม. (กรมอนามัย / เกณฑ์ภาวะอ้วนลงพุงเอเชีย)',
        'RFM (Woolcott & Bergman, Scientific Reports 2018): ชาย 64 − 20 × ส่วนสูง/รอบเอว · หญิง 76 − 20 × ส่วนสูง/รอบเอว ใกล้เคียงการวัดด้วย DXA',
        'BRI (Thomas et al. 2013): 364.2 − 365.5 × √(1 − (รอบเอว/2π)² ÷ (0.5 × ส่วนสูง)²) · ช่วงจาก JAMA Network Open 2024 (Zhang et al.): 4.45–5.45 เสี่ยงต่ำสุด, ≥ 6.91 เสี่ยงเสียชีวิตสูงขึ้น',
        'ดัชนีเหล่านี้ใช้คัดกรองและดูแนวโน้ม ไม่ใช่การวินิจฉัยโรค',
      ]} />
    </Card>
  )
}

// ============================ คุณภาพการลดน้ำหนัก ============================

const RATE_TEXT: Record<LossRate['band'], { label: string; tone: string; tip: string }> = {
  gain: { label: 'น้ำหนักขึ้น', tone: 'text-red-600', tip: 'แนวโน้มเพิ่มขึ้น ตรวจว่าแคลจริงเกินเป้าหรือบันทึกไม่ครบ' },
  flat: { label: 'ทรงตัว', tone: 'text-amber-700', tip: 'แทบไม่ลด ดูหัวข้อน้ำหนักนิ่งด้านล่าง' },
  slow: { label: 'ช้า', tone: 'text-amber-700', tip: 'ลดได้แต่ช้า ถ้าอยากเร็วขึ้นลองคุมแคลให้ตรงเป้ามากขึ้นหรือเพิ่มกิจกรรม' },
  good: { label: 'พอดี (ค่อยเป็นค่อยไป)', tone: 'text-sky-700', tip: 'ลดแบบยั่งยืน รักษากล้ามเนื้อได้ดี' },
  ideal: { label: 'ดีที่สุด', tone: 'text-emerald-700', tip: 'อยู่ในช่วงที่แนะนำ 0.5–1% ต่อสัปดาห์' },
  fast: { label: 'เร็วเกินไป', tone: 'text-red-600', tip: 'เกิน 1% ต่อสัปดาห์ เสี่ยงเสียกล้ามเนื้อ นิ่วในถุงน้ำดี และโยโย่ — กินเพิ่มอีกนิดและให้โปรตีนถึงเป้า' },
}

export function LossQualityCard({ rate, plateau, fat, adapt, planRate }: {
  rate?: LossRate
  plateau: Plateau
  fat?: { lost: number; span: number; share?: number; fatLost?: number; leanLost?: number; first: { date: string }; last: { date: string } }
  adapt?: Adaptation
  planRate: number
}) {
  return (
    <Card title="📉 คุณภาพการลดน้ำหนัก">
      {/* อัตราลด */}
      <div className="rounded-xl bg-slate-50 p-3">
        <div className="text-xs text-slate-500">อัตราลด (แนวโน้ม 28 วัน)</div>
        {rate ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${RATE_TEXT[rate.band].tone}`}>{rate.pctPerWeek.toFixed(2)}%</span>
              <span className="text-sm text-slate-600">ต่อสัปดาห์ · {fmt1(rate.perWeekKg)} กก./สัปดาห์ (แผน {planRate})</span>
            </div>
            <RateBar pct={rate.pctPerWeek} />
            <p className={`mt-1 text-xs ${RATE_TEXT[rate.band].tone}`}><b>{RATE_TEXT[rate.band].label}</b> — {RATE_TEXT[rate.band].tip}</p>
          </>
        ) : (
          <p className="text-sm text-slate-500">ชั่งน้ำหนักเช้าอย่างน้อย 5 วัน ในช่วง 7 วันขึ้นไป แล้วจะคำนวณให้</p>
        )}
      </div>

      {/* น้ำหนักนิ่ง */}
      <div className="mt-3">
        <div className="text-sm font-medium">⏸️ ตรวจภาวะน้ำหนักนิ่ง (21 วัน)</div>
        {plateau.status === 'insufficient' && <p className="text-xs text-slate-500">ต้องชั่งน้ำหนักเช้าอย่างน้อย 10 วันใน 3 สัปดาห์</p>}
        {plateau.status === 'losing' && <p className="text-xs text-emerald-700">ไม่นิ่ง — 3 สัปดาห์ล่าสุดยังลด {fmt1(plateau.perWeekKg)} กก./สัปดาห์ 👍</p>}
        {plateau.status === 'plateau' && (
          <div className={`mt-1 rounded-xl px-3 py-2 text-xs ${plateau.adherent ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-800'}`}>
            <p>
              น้ำหนักแทบไม่เปลี่ยนใน 3 สัปดาห์ ({sign(-plateau.perWeekKg, 2)} กก./สัปดาห์)
              {plateau.avgKcal !== undefined && ` · กินเฉลี่ย ${fmtInt(plateau.avgKcal)} kcal เทียบเป้า ${fmtInt(plateau.avgTarget)}`}
            </p>
            {plateau.adherent ? (
              <ul className="mt-1 list-disc pl-4">
                <li>กินตามเป้าแต่ไม่ลด = <b>นิ่งจริง</b> ลองชั่งตวงอาหารให้แม่นขึ้น (น้ำมัน น้ำจิ้ม เครื่องดื่ม มักหลุด)</li>
                <li>เพิ่มการเคลื่อนไหว เช่น เดินเพิ่ม 2,000–3,000 ก้าว/วัน (≈ 100–150 kcal)</li>
                <li>ถ้าเพิ่งเริ่มออกกำลังหนัก กล้ามเนื้ออาจเก็บน้ำ — ดูรอบเอวประกอบ</li>
                <li>ถ้าลดมานานหลายเดือน พิจารณาพักกินที่ระดับคงน้ำหนัก 1–2 สัปดาห์ (diet break)</li>
              </ul>
            ) : (
              <p className="mt-1">แคลเฉลี่ยเกินเป้า — ยังไม่ใช่ภาวะนิ่ง ดู “รูปแบบที่ทำให้หลุดเป้า” ด้านล่างก่อน</p>
            )}
            {plateau.days < 10 && <p className="mt-1 opacity-80">* บันทึกอาหารครบเพียง {plateau.days} วันใน 21 วัน ผลอาจคลาดเคลื่อน</p>}
          </div>
        )}
      </div>

      {/* ไขมัน vs กล้ามเนื้อ */}
      <div className="mt-3">
        <div className="text-sm font-medium">🧬 น้ำหนักที่ลดเป็นไขมันกี่ %</div>
        {!fat ? (
          <p className="text-xs text-slate-500">ต้องมีผลวัดองค์ประกอบร่างกายอย่างน้อย 2 ครั้ง (แท็บร่างกาย)</p>
        ) : fat.share === undefined ? (
          <p className="text-xs text-slate-500">ผลวัด 2 ครั้งล่าสุดห่างกัน {Math.round(fat.span)} วัน น้ำหนักต่างกัน {fmt1(fat.lost)} กก. — ต้องห่าง ≥ 14 วันและลด ≥ 1 กก. ถึงจะเทียบได้</p>
        ) : (
          <>
            <div className="mt-1 flex h-6 overflow-hidden rounded-lg text-[11px] font-medium text-white">
              <div className="flex items-center justify-center" style={{ width: `${Math.max(0, Math.min(100, fat.share * 100))}%`, background: C.s2 }}>
                ไขมัน {fmt1(fat.fatLost!)}
              </div>
              <div className="flex flex-1 items-center justify-center" style={{ background: C.s1 }}>
                ไร้ไขมัน {fmt1(fat.leanLost!)}
              </div>
            </div>
            <p className={`mt-1 text-xs ${fat.share >= 0.75 ? 'text-emerald-700' : fat.share >= 0.6 ? 'text-amber-700' : 'text-red-600'}`}>
              {formatThaiDate(fat.first.date)} → {formatThaiDate(fat.last.date)}: ลด {fmt1(fat.lost)} กก. เป็นไขมัน {Math.round(fat.share * 100)}%
              {fat.share >= 0.75 ? ' — ดีมาก รักษากล้ามเนื้อไว้ได้' : ' — เสียมวลไร้ไขมันค่อนข้างมาก: ให้โปรตีนถึงเป้า เพิ่มเวทเทรนนิ่ง 2–3 ครั้ง/สัปดาห์ และอย่าลดเร็วเกินไป'}
            </p>
            <p className="text-[11px] text-slate-400">มวลไร้ไขมันรวมน้ำด้วย เครื่องแบบ BIA แกว่งตามน้ำในร่างกาย — วัดเวลาเดิม สภาพเดิม</p>
          </>
        )}
      </div>

      {/* ระบบเผาผลาญ */}
      <div className="mt-3">
        <div className="text-sm font-medium">🔥 ระบบเผาผลาญชะลอไหม</div>
        {!adapt ? (
          <p className="text-xs text-slate-500">ต้องบันทึกอาหารครบ ≥ 14 วันใน 28 วัน และชั่งเช้าสม่ำเสมอ</p>
        ) : (
          <>
            <p className="text-xs text-slate-600">
              TDEE จริง {fmtInt(adapt.real)} kcal เทียบสูตรที่น้ำหนักปัจจุบัน {fmtInt(adapt.formula)} kcal →{' '}
              <b className={adapt.pct <= -0.1 ? 'text-red-600' : adapt.pct <= -0.05 ? 'text-amber-700' : 'text-emerald-700'}>{sign(adapt.pct * 100, 0)}%</b>
              {adapt.prev && <> · 4 สัปดาห์ก่อน {sign(adapt.prev.pct * 100, 0)}%</>}
            </p>
            <p className={`mt-1 text-xs ${adapt.pct <= -0.1 ? 'text-red-600' : 'text-slate-500'}`}>
              {adapt.pct <= -0.1
                ? 'ร่างกายใช้พลังงานน้อยกว่าที่ควรเกิน 10% — อาจเป็นการปรับตัว (metabolic adaptation) หรือบันทึกอาหารต่ำกว่าจริง ลองตรวจการบันทึก เพิ่มการเดิน และพิจารณาพักกินที่ระดับคงน้ำหนัก 1–2 สัปดาห์'
                : adapt.pct <= -0.05
                  ? 'ต่ำกว่าสูตรเล็กน้อย ยังอยู่ในช่วงปกติ (งานวิจัยพบลดได้ 5–25% ระหว่างลดน้ำหนัก) ติดตามต่อ'
                  : 'ยังเผาผลาญใกล้เคียงสูตร ไม่พบการชะลอ'}
            </p>
          </>
        )}
      </div>

      <Sources items={[
        'อัตราลดที่แนะนำ 0.5–1% ของน้ำหนักตัวต่อสัปดาห์ (≈ 0.5–1 กก.) ตามแนวทาง NIH / CDC',
        'น้ำหนักนิ่ง: เส้นแนวโน้ม 21 วันลดน้อยกว่า 0.1 กก./สัปดาห์ แยกกรณีกินเกินเป้าออก',
        'สัดส่วนไขมันที่ลด: กฎทั่วไปคาดว่า ~25% ของน้ำหนักที่ลดเป็นมวลไร้ไขมัน (Heymsfield 2014 ชี้ว่าแปรผันตามเพศ อายุ BMI) → ≥ 75% เป็นไขมันถือว่าดี',
        'Metabolic adaptation: พลังงานที่ใช้ลดลงมากกว่าที่น้ำหนักลดอธิบายได้ งานวิจัยพบ 5–25% · การพักลดแคลเป็นช่วง (MATADOR 2018) ช่วยได้',
      ]} />
    </Card>
  )
}

function RateBar({ pct }: { pct: number }) {
  // สเกล −0.5% (ขึ้น) ถึง 1.5% ต่อสัปดาห์
  const lo = -0.5, hi = 1.5
  const pos = (v: number) => ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * 100
  const segs = [
    { from: lo, to: 0.1, color: '#e34948' },
    { from: 0.1, to: 0.25, color: '#f2b33d' },
    { from: 0.25, to: 0.5, color: '#7cb3ec' },
    { from: 0.5, to: 1, color: '#10b981' },
    { from: 1, to: hi, color: '#e34948' },
  ]
  return (
    <div className="mt-2">
      <div className="relative h-2 overflow-hidden rounded-full">
        {segs.map((s) => (
          <div key={s.from} className="absolute top-0 h-2" style={{ left: `${pos(s.from)}%`, width: `${pos(s.to) - pos(s.from)}%`, background: s.color, opacity: 0.75 }} />
        ))}
      </div>
      <div className="relative h-3">
        <div className="absolute -top-3 h-4 w-1 -translate-x-1/2 rounded bg-slate-800" style={{ left: `${pos(pct)}%` }} />
      </div>
      <div className="relative h-3 text-[10px] text-slate-400">
        {[0, 0.5, 1].map((t) => <span key={t} className="absolute -translate-x-1/2" style={{ left: `${pos(t)}%` }}>{t}%</span>)}
      </div>
    </div>
  )
}

// ============================ พฤติกรรม ============================

export function BehaviorCard({ cons, time, patterns, incomplete }: {
  cons?: Consistency
  time: Timing
  patterns: { over: number; total: number; findings: Finding[] }
  incomplete: [string, string][]
}) {
  const g = cons ? gradeOf(cons.score) : undefined
  return (
    <Card title="🧭 พฤติกรรมการกิน">
      {/* ความสม่ำเสมอ */}
      {cons ? (
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-slate-500">คะแนนความสม่ำเสมอ ({cons.days} วันล่าสุด)</span>
            <span><b className={`text-2xl ${g!.color}`}>{cons.score}</b><span className="text-sm text-slate-400">/100 · {g!.label}</span></span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
            <Stat label="บันทึกครบ" v={`${cons.logged}/${cons.days}`} sub="40%" />
            <Stat label="ไม่เกินเป้า 10%" v={`${cons.adherent}/${cons.days}`} sub="40%" />
            <Stat label="ชั่งเช้า" v={`${cons.weighed}/${cons.days}`} sub="20%" />
          </div>
          <p className="mt-2 text-[11px] text-slate-500">งานวิจัยพบว่าคนที่บันทึกอาหาร ≥ 6 วันต่อสัปดาห์ลดน้ำหนักได้มากกว่าอย่างชัดเจน — ไม่ต้องสมบูรณ์แบบ แค่สม่ำเสมอ</p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">ใช้งานอย่างน้อย 3 วันแล้วจะคำนวณคะแนนให้</p>
      )}

      {/* เวลากิน */}
      <div className="mt-3">
        <div className="text-sm font-medium">🕘 เวลากิน</div>
        {time.timedDays < 3 ? (
          <p className="text-xs text-slate-500">ใส่เวลากินตอนเพิ่มอาหาร (หรือบันทึกทันทีหลังกิน) อย่างน้อย 3 วัน แล้วจะวิเคราะห์ให้</p>
        ) : (
          <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
            <Stat label="ช่วงเวลากิน/วัน (กลาง)" v={time.windowMin !== undefined ? `${fmt1(time.windowMin / 60)} ชม.` : '–'}
              sub={time.firstMedian ? `${time.firstMedian} – ${time.lastMedian}` : ''} />
            <Stat label="วันที่มีมื้อดึก (หลัง 21:00)" v={`${time.lateDays}/${time.timedDays}`}
              sub={time.lateDays ? `เฉลี่ย ${fmtInt(time.lateKcalAvg)} kcal` : 'ไม่มี 👍'} tone={time.lateDays / time.timedDays >= 0.3 ? 'warn' : undefined} />
            <Stat label="ไม่กินมื้อเช้า" v={`${time.noBreakfast}/${time.loggedDays}`} sub="วันที่บันทึกครบ" tone={time.noBreakfast / Math.max(1, time.loggedDays) >= 0.5 ? 'warn' : undefined} />
            <Stat label="วันที่มีเวลากิน" v={`${time.timedDays}`} sub="ใช้วิเคราะห์" />
          </div>
        )}
        {time.timedDays >= 3 && time.lateDays / time.timedDays >= 0.3 && (
          <p className="mt-1 text-xs text-amber-800">กินดึกบ่อย — มื้อดึกมักเป็นของว่าง/เครื่องดื่มที่แคลสูง และรบกวนการนอน ลองปิดครัวก่อน 3 ทุ่ม หรือเตรียมของว่างแคลต่ำไว้</p>
        )}
      </div>

      {/* รูปแบบที่ทำให้หลุดเป้า */}
      <div className="mt-3">
        <div className="text-sm font-medium">🎯 รูปแบบที่ทำให้หลุดเป้า</div>
        {patterns.total < 7 ? (
          <p className="text-xs text-slate-500">ต้องมีวันที่บันทึกครบอย่างน้อย 7 วัน</p>
        ) : patterns.over < 2 ? (
          <p className="text-xs text-emerald-700">เกินเป้าแค่ {patterns.over} จาก {patterns.total} วัน — ยังไม่พบรูปแบบ 👍</p>
        ) : patterns.findings.length ? (
          <ul className="mt-1 space-y-1 text-xs text-slate-700">
            <li className="text-slate-500">เกินเป้า {patterns.over} จาก {patterns.total} วัน</li>
            {patterns.findings.map((f) => <li key={f.text} className="flex gap-2"><span>{f.icon}</span><span>{f.text}</span></li>)}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">เกินเป้า {patterns.over} จาก {patterns.total} วัน กระจายๆ ไม่ได้มาจากวัน มื้อ หรือเมนูใดชัดเจน</p>
        )}
      </div>

      {/* วันที่น่าจะไม่ครบ */}
      <div className="mt-3">
        <div className="text-sm font-medium">📝 วันที่น่าจะบันทึกไม่ครบ</div>
        {incomplete.length ? (
          <>
            <p className="text-xs text-slate-600">{incomplete.length} วัน — ไม่นำมาคิดแคลเฉลี่ย TDEE จริง และคะแนนต่างๆ เพื่อไม่ให้ผลเพี้ยน</p>
            <ul className="mt-1 flex flex-wrap gap-1 text-[11px]">
              {incomplete.slice(-8).map(([d, why]) => (
                <li key={d} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{shortDate(d)} · {why}</li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-slate-400">ถ้าวันไหนตั้งใจกินน้อยจริง (เช่น ไม่สบาย) ไม่เป็นไร — แค่ไม่ถูกนับ</p>
          </>
        ) : (
          <p className="text-xs text-emerald-700">ไม่พบ ทุกวันที่บันทึกดูครบ 👍</p>
        )}
      </div>
      <Sources items={[
        'วันที่ไม่ครบ: แคลรวมต่ำกว่า 800 kcal หรือต่ำกว่าครึ่งหนึ่งของเป้า หรือมีมื้อหลักไม่ถึง 2 มื้อ',
        'มื้อดึก: กินหลัง 21:00 ตั้งแต่ 100 kcal ขึ้นไป · เวลากินใช้เวลาที่ใส่ไว้ หรือเวลาที่กดบันทึกถ้าบันทึกวันเดียวกัน',
        'ความสม่ำเสมอ: Burke et al. / Harvey et al. 2019 พบว่าความถี่ในการบันทึกสัมพันธ์กับการลดน้ำหนักมากกว่าเวลาที่ใช้บันทึก',
      ]} />
    </Card>
  )
}

function Stat({ label, v, sub, tone }: { label: string; v: string; sub?: string; tone?: 'warn' }) {
  return (
    <div className="rounded-lg bg-white p-2 ring-1 ring-slate-100">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-base font-semibold ${tone === 'warn' ? 'text-amber-700' : ''}`}>{v}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  )
}

// ============================ คุณภาพอาหาร ============================

const MEAL_LABEL = Object.fromEntries(MEALS.map((m) => [m.key, m.label])) as Record<Meal, string>

const partColor = (r: number) => (r >= 0.8 ? '#10b981' : r >= 0.5 ? '#f2b33d' : '#e34948')

function PartBars({ parts }: { parts: DayQuality['parts'] }) {
  return (
    <div className="space-y-1.5">
      {parts.map((p) => (
        <div key={p.key} className="flex items-center gap-2 text-xs">
          <span className="w-16 shrink-0 text-slate-600">{p.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-2 rounded-full" style={{ width: `${(p.got / p.max) * 100}%`, background: partColor(Math.round(p.got * 10) / 10 / p.max) }} />
          </div>
          <span className="w-12 shrink-0 text-right text-slate-500">{fmt1(p.got)}/{p.max}</span>
        </div>
      ))}
    </div>
  )
}

/** บรรทัดสรุปในการ์ดสารอาหารหน้าบันทึก — แตะเพื่อดูรายละเอียดของวันนั้น */
export function DayQualityLine({ q, limits }: { q: DayQuality; limits: Limits }) {
  const [open, setOpen] = useState(false)
  if (!q.kcal) return null
  const g = gradeOf(q.score)
  const hit = q.mealProtein.filter((m) => m.protein >= PROTEIN_PER_MEAL).length
  const weak = weakestPart(q)
  const sugarShare = q.total.sugar ? q.drinkSugar / q.total.sugar : 0
  return (
    <div className="mt-3 rounded-xl bg-slate-50">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="รายละเอียดคะแนนอาหารวันนี้"
        className="grid w-full grid-cols-3 gap-2 p-2 text-center text-xs">
        <div>
          <div className="text-[10px] text-slate-500">คะแนนอาหาร</div>
          <div><b className={`text-base ${g.color}`}>{q.score}</b><span className="text-slate-400">/100</span></div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500">🥦 ผักผลไม้</div>
          <div><b className="text-base">{fmt1(q.vf)}</b><span className="text-slate-400">/{VF_GOAL} ส่วน</span></div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500">🍗 มื้อโปรตีน ≥ {PROTEIN_PER_MEAL}g</div>
          <div><b className="text-base">{hit}</b><span className="text-slate-400">/{q.mealProtein.length || 3} มื้อ</span></div>
        </div>
        <div className="col-span-3 -mt-1 text-[11px] text-emerald-700">{open ? 'ซ่อนรายละเอียด ▴' : 'แตะดูรายละเอียดวันนี้ ▾'}</div>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-200 p-3">
          <div>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-medium text-slate-700">คะแนนแยกด้าน</span>
              <span className={g.color}>{g.label}</span>
            </div>
            <PartBars parts={q.parts} />
            <p className="mt-1 text-xs text-slate-600">
              {weak ? <>ควรปรับก่อน: <b>{weak.label}</b></> : 'ทุกด้านอยู่ในเกณฑ์ดี'}
            </p>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-700">🍗 โปรตีนแต่ละมื้อ (เป้า ≥ {PROTEIN_PER_MEAL} g)</div>
            <div className="mt-1 grid grid-cols-3 gap-2 text-center text-xs">
              {(['breakfast', 'lunch', 'dinner'] as Meal[]).map((m) => {
                const x = q.mealProtein.find((y) => y.meal === m)
                return (
                  <div key={m} className="rounded-lg bg-white p-1.5">
                    <div className="text-[11px] text-slate-500">{MEAL_LABEL[m]}</div>
                    {x ? (
                      <div className={`text-sm font-semibold ${x.protein >= PROTEIN_PER_MEAL ? 'text-emerald-700' : 'text-amber-600'}`}>
                        {Math.round(x.protein)} g{x.protein >= PROTEIN_PER_MEAL ? ' ✓' : ''}
                      </div>
                    ) : <div className="text-sm text-slate-400">ยังไม่กิน</div>}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="text-xs">
            <div className="font-medium text-slate-700">🥤 น้ำตาลจากเครื่องดื่ม</div>
            {q.drinks.length ? (
              <>
                <p className="mt-0.5 text-slate-600">
                  {Math.round(q.drinkSugar)} g ({Math.round(sugarShare * 100)}% ของน้ำตาลวันนี้ {fmt1(q.total.sugar)} g / โควตา {limits.sugar} g)
                </p>
                <ul className="mt-1 space-y-0.5">
                  {q.drinks.slice(0, 4).map((d, i) => (
                    <li key={i} className="flex justify-between gap-2 text-slate-600">
                      <span className="truncate">{d.name}</span>
                      <span className="shrink-0">{Math.round(d.sugar)} g</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : <p className="mt-0.5 text-slate-500">ไม่มีเครื่องดื่มที่มีน้ำตาลวันนี้ ✓</p>}
          </div>

          <p role="note" className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-900">💡 {dayTip(q, limits)}</p>
        </div>
      )}
    </div>
  )
}

export function DietQualityCard({ days }: { days: { date: string; q: DayQuality }[] }) {
  if (!days.length) {
    return <Card title="🥗 คุณภาพอาหาร"><p className="text-sm text-slate-500">ยังไม่มีวันที่บันทึกครบในช่วงนี้</p></Card>
  }
  const n = days.length
  const avg = (f: (q: DayQuality) => number) => days.reduce((s, d) => s + f(d.q), 0) / n
  const score = Math.round(avg((q) => q.score))
  const g = gradeOf(score)
  const parts = days[0].q.parts.map((p, i) => ({ ...p, got: avg((q) => q.parts[i].got) }))
  const weakest = [...parts].sort((a, b) => a.got / a.max - b.got / b.max)[0]
  const vf = avg((q) => q.vf)
  const vfDays = days.filter((d) => d.q.vf >= VF_GOAL).length

  // โปรตีนต่อมื้อ
  const perMeal = (['breakfast', 'lunch', 'dinner'] as Meal[]).map((m) => {
    const xs = days.flatMap((d) => d.q.mealProtein.filter((x) => x.meal === m).map((x) => x.protein))
    return { m, avg: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined, hit: xs.filter((x) => x >= PROTEIN_PER_MEAL).length, n: xs.length }
  })

  const sugar = days.reduce((s, d) => s + d.q.total.sugar, 0)
  const drinkSugar = days.reduce((s, d) => s + d.q.drinkSugar, 0)
  const kcal = days.reduce((s, d) => s + d.q.kcal, 0)
  const drinkKcal = days.reduce((s, d) => s + d.q.drinkKcal, 0)
  const drinkShare = sugar ? drinkSugar / sugar : 0

  return (
    <Card title="🥗 คุณภาพอาหาร">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-slate-500">คะแนนเฉลี่ย ({n} วันที่บันทึกครบ)</span>
        <span><b className={`text-2xl ${g.color}`}>{score}</b><span className="text-sm text-slate-400">/100 · {g.label}</span></span>
      </div>
      <div className="mt-2"><PartBars parts={parts} /></div>
      <p className="mt-1 text-xs text-slate-600">จุดที่ควรปรับก่อน: <b>{weakest.label}</b></p>

      <ScoreChart days={days} />

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Stat label="🥦 ผักผลไม้เฉลี่ย/วัน" v={`${fmt1(vf)} ส่วน`} sub={`ถึง ${VF_GOAL} ส่วน ${vfDays}/${n} วัน`} tone={vf < 3 ? 'warn' : undefined} />
        <Stat label="🥤 น้ำตาลจากเครื่องดื่ม" v={`${Math.round(drinkShare * 100)}%`} sub={`ของน้ำตาลทั้งหมด · ${Math.round(kcal ? (drinkKcal / kcal) * 100 : 0)}% ของแคล`} tone={drinkShare >= 0.5 ? 'warn' : undefined} />
      </div>
      {drinkShare >= 0.5 && (
        <p className="mt-1 text-xs text-amber-800">น้ำตาลส่วนใหญ่มาจากเครื่องดื่ม — เปลี่ยนเป็นหวานน้อย/ไม่หวาน คือจุดที่ลดง่ายที่สุด (ชาเย็น 1 แก้ว ≈ น้ำตาล 8–11 ช้อนชา)</p>
      )}

      <div className="mt-3">
        <div className="text-sm font-medium">🍗 โปรตีนแต่ละมื้อ (เป้า ≥ {PROTEIN_PER_MEAL} g)</div>
        <div className="mt-1 grid grid-cols-3 gap-2 text-center text-xs">
          {perMeal.map((x) => (
            <div key={x.m} className="rounded-lg bg-slate-50 p-2">
              <div className="text-[11px] text-slate-500">{MEAL_LABEL[x.m]}</div>
              <div className={`text-base font-semibold ${x.avg !== undefined && x.avg >= PROTEIN_PER_MEAL ? 'text-emerald-700' : 'text-amber-700'}`}>
                {x.avg !== undefined ? `${Math.round(x.avg)} g` : '–'}
              </div>
              <div className="text-[10px] text-slate-400">{x.n ? `ถึงเป้า ${x.hit}/${x.n} มื้อ` : 'ไม่ได้กิน'}</div>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-slate-500">กระจายโปรตีน 20–30 g ทุกมื้อ ช่วยสร้างกล้ามเนื้อได้ดีกว่ากินรวดเดียวมื้อเดียว และอิ่มนานขึ้น</p>
      </div>

      <Sources items={[
        'คะแนน 0–100: ผักผลไม้ 25 · โปรตีน 20 · น้ำตาล 20 · โซเดียม 20 · ไขมัน 15 (เกินเกณฑ์ลดคะแนนตามสัดส่วน)',
        `ผักผลไม้: WHO แนะนำ ≥ 400 g/วัน ≈ ${VF_GOAL} ส่วน (ส่วนละ ~80 g) · สธ. แนะนำผัก 4–6 ทัพพี ผลไม้ 3–5 ส่วน — ค่าผักในเมนูเป็นการประมาณจากชื่อเมนู ไม่นับน้ำผลไม้`,
        'โปรตีนต่อมื้อ ~0.3–0.4 g/กก. หรือ 20–30 g ต่อมื้อ (ISSN position stand 2017)',
        'เครื่องดื่ม: ชา กาแฟ นม น้ำหวาน น้ำผลไม้ น้ำอัดลม แอลกอฮอล์ และของที่หน่วยเป็นแก้ว/ขวด/กระป๋อง',
      ]} />
    </Card>
  )
}

const H = 150
const M = { t: 8, r: 8, b: 22, l: 28 }

function ScoreChart({ days }: { days: { date: string; q: DayQuality }[] }) {
  const [ref, W] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const n = days.length
  if (n < 2) return <div ref={ref} />
  const iw = W - M.l - M.r
  const ih = H - M.t - M.b
  const col = iw / n
  const gap = col > 6 ? 2 : col > 3 ? 1 : 0
  const bw = Math.max(1, col - gap)
  const y = (v: number) => M.t + ih - (v / 100) * ih
  const cx = (i: number) => M.l + col * i + col / 2
  const { ticks } = niceTicks(0, 100, 4)
  const avg = days.map((_, i) => {
    const win = days.slice(Math.max(0, i - 6), i + 1)
    return win.length >= 3 ? win.reduce((s, d) => s + d.q.score, 0) / win.length : undefined
  })
  const bar = (i: number, v: number) => {
    const x0 = M.l + col * i + gap / 2
    const y0 = y(v)
    const h = M.t + ih - y0
    const rr = Math.min(4, bw / 2, h)
    return `M${x0},${M.t + ih}V${y0 + rr}Q${x0},${y0} ${x0 + rr},${y0}H${x0 + bw - rr}Q${x0 + bw},${y0} ${x0 + bw},${y0 + rr}V${M.t + ih}Z`
  }
  const hd = hover !== null ? days[hover] : null
  return (
    <div ref={ref} className="relative mt-3">
      <Legend items={[
        { label: 'คะแนนรายวัน', color: C.s1, kind: 'rect' },
        { label: 'เฉลี่ย 7 วัน', color: C.ink, kind: 'line' },
        { label: 'ดีมาก (80)', color: C.ref, kind: 'dash' },
      ]} />
      <svg width={W} height={H} role="img" aria-label="กราฟคะแนนคุณภาพอาหารรายวัน" className="block touch-pan-y">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke={C.grid} />
            <text x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill={C.axis}>{t}</text>
          </g>
        ))}
        {xLabelIdx(n, W).map((i) => (
          <text key={i} x={cx(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="10" fill={C.axis}>{shortDate(days[i].date)}</text>
        ))}
        {days.map((d, i) => d.q.score > 0 && (
          <path key={d.date} d={bar(i, d.q.score)} fill={C.s1} opacity={hover === null || hover === i ? 1 : 0.55} />
        ))}
        <line x1={M.l} x2={W - M.r} y1={y(80)} y2={y(80)} stroke={C.ref} strokeWidth="1.5" strokeDasharray="4 3" />
        <path d={linePath(avg, cx, y)} fill="none" stroke={C.ink} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {days.map((d, i) => (
          <rect key={`h${d.date}`} x={M.l + col * i} y={M.t} width={col} height={ih} fill="transparent"
            onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} onPointerLeave={() => setHover(null)} />
        ))}
      </svg>
      {hd && (
        <Tooltip x={cx(hover!)} width={W}>
          <div className="mb-0.5 text-slate-500">{formatThaiDate(hd.date)}</div>
          <TipRow color={C.s1} kind="rect" label="คะแนน" value={`${hd.q.score} (${gradeOf(hd.q.score).label})`} />
          {avg[hover!] !== undefined && <TipRow color={C.ink} label="เฉลี่ย 7 วัน" value={String(Math.round(avg[hover!]!))} />}
          <div className="mt-0.5 text-[11px] text-slate-500">ผักผลไม้ {fmt1(hd.q.vf)} ส่วน · โปรตีน {Math.round(hd.q.total.protein)} g</div>
        </Tooltip>
      )}
    </div>
  )
}
