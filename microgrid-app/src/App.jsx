import { useState, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════
   COMPONENT LIBRARIES
═══════════════════════════════════════════════════════════════ */
const PANELS = [
  {id:'jinko_400',  name:'Jinko Tiger Neo 400W',   Pmax:400, Voc:48.6, Vmp:40.5, Isc:9.87, Imp:9.38},
  {id:'rec_405',    name:'REC Alpha 405W',          Pmax:405, Voc:49.9, Vmp:42.1, Isc:9.68, Imp:9.62},
  {id:'longi_430',  name:'LONGi Hi-MO6 430W',      Pmax:430, Voc:51.4, Vmp:43.5, Isc:10.1, Imp:9.87},
  {id:'silfab_480', name:'Silfab SIL-480 HJT',     Pmax:480, Voc:52.8, Vmp:44.6, Isc:10.8, Imp:10.4},
  {id:'qcells_400', name:'Qcells Q.PEAK DUO 400W', Pmax:400, Voc:49.2, Vmp:41.0, Isc:9.75, Imp:9.20},
  {id:'custom',     name:'⊕ Custom Panel...'},
];

const BATTERIES = [
  {id:'pylontech',   name:'Pylontech US5000',       kWh:5.12, dod:0.80, chem:'lfp'},
  {id:'eg4_life',    name:'EG4 LifePower4',         kWh:5.12, dod:0.80, chem:'lfp'},
  {id:'eg4_wall',    name:'EG4 WallMount-E 10kWh',  kWh:10.0, dod:0.80, chem:'lfp'},
  {id:'battleborn',  name:'Battle Born 100Ah LFP',  kWh:1.28, dod:0.80, chem:'lfp'},
  {id:'trojan_t105', name:'Trojan T-105 FLA 6V',    kWh:1.26, dod:0.40, chem:'fla'},
  {id:'crown_agm',   name:'Crown CR-235 AGM 6V',    kWh:2.82, dod:0.50, chem:'agm'},
  {id:'custom',      name:'⊕ Custom Battery...'},
];

/* ═══════════════════════════════════════════════════════════════
   NEC REFERENCE TABLES & HELPERS
═══════════════════════════════════════════════════════════════ */
const BKRS = [15,20,25,30,35,40,50,60,70,80,90,100,110,125,150,175,200,225,250,300,350,400];
const WIRES = [
  {g:"14",a:15},{g:"12",a:20},{g:"10",a:30},{g:"8",a:50},{g:"6",a:65},{g:"4",a:85},
  {g:"3",a:100},{g:"2",a:115},{g:"1",a:130},{g:"1/0",a:150},{g:"2/0",a:175},
  {g:"3/0",a:200},{g:"4/0",a:230},{g:"250kcmil",a:255},{g:"300kcmil",a:285},{g:"350kcmil",a:310}
];
const nextB = a => BKRS.find(b => b >= a) || 400;
const wFor  = a => {
  const e = WIRES.find(w => w.a >= a);
  if (!e) return "Parallel conductors reqd";
  return e.g.endsWith("kcmil") ? `${e.g}` : `#${e.g} AWG`;
};

/* ═══════════════════════════════════════════════════════════════
   COLOR / STATUS ENGINE
═══════════════════════════════════════════════════════════════ */
const uc  = p => p<=0?"#2563eb":p<65?"#16a34a":p<82?"#65a30d":p<95?"#ca8a04":p<108?"#ea580c":"#dc2626";
const ubg = p => p<=0?"#eff6ff":p<65?"#f0fdf4":p<82?"#f7fee7":p<95?"#fefce8":p<108?"#fff7ed":"#fef2f2";
const ut  = p => p<=0?"IDLE":p<65?"NORMAL":p<82?"RUNNING":p<95?"CAUTION":p<108?"WARNING":"OVERCURRENT!";

/* ═══════════════════════════════════════════════════════════════
   CALCULATION ENGINE  (NEC 430 · 480 · 690 · 310.15)
═══════════════════════════════════════════════════════════════ */
function calcSys(inp) {
  const {hp, volts, phase, hrs, sun, days, sv, panel, battery} = inp;
  const PH = phase === 3 ? Math.sqrt(3) : 1;
  const EFF = 0.88, PF = 0.85;

  const flc      = (hp * 746) / (volts * PH * EFF * PF);
  const lrc      = flc * 6.5;
  const pKW      = hp * 0.746 / EFF;
  const surgeKW  = (lrc * volts * PH) / 1000;
  const mCA      = flc * 1.25;
  const mOCPD    = nextB(flc * 2.5);
  const mWire    = wFor(mCA);

  const kwhD = pKW * hrs;

  const PW  = Math.max(panel.Pmax, 1);
  const VOC = panel.Voc;
  const VMP = panel.Vmp;
  const ISC = panel.Isc;
  const IMP = panel.Imp;

  const needKW = kwhD / (sun * 0.78);
  const numP   = Math.ceil(needKW * 1000 / PW);
  const pvKW   = numP * PW / 1000;
  const pps    = sv >= 48 ? 2 : 1;
  const strs   = Math.ceil(numP / pps);

  const pvCA   = ISC * 1.56;
  const pvFuse = nextB(pvCA);
  const pvWire = wFor(pvCA);
  const dcBA   = ISC * strs;
  const dcCA   = dcBA * 1.25;
  const dcFuse = nextB(dcCA);
  const dcWire = wFor(dcCA);

  const bModKwh = Math.max(battery.kWh, 0.1);
  const dod     = battery.dod;
  const chem    = battery.chem;
  const bReq    = kwhD * days / dod;
  const bNum    = Math.ceil(bReq / bModKwh);
  const bKwh    = bNum * bModKwh;
  const bA      = (pKW * 1000 / sv) * 1.1;
  const bOCP    = nextB(bA * 1.25);
  const bWir    = wFor(bA * 1.25);

  const minKW  = Math.max(pKW / 0.80, surgeKW / 2.5);
  const invKW  = [3,5,8,10,12,15,20,25,30].find(s => s >= minKW) || 30;
  const invAC  = invKW * 1000 / 240;
  const invOCP = nextB(invAC * 1.25);
  const invWir = wFor(invAC);

  const pvU = ISC / pvFuse * 100;
  const dcU = dcBA / dcFuse * 100;
  const bU  = bA / bOCP * 100;
  const acU = flc / invAC * 100;
  const mU  = flc / (mOCPD * 0.40) * 100;

  const cc = {pv:pvKW*800, batt:bNum*1100, inv:invKW*200+700, wire:Math.max(1000,numP*38), misc:1600};
  cc.total = Object.values(cc).reduce((a,b)=>a+b,0);

  const warns = [];
  if (phase===3 || volts===480 || volts===600)
    warns.push("⚠ 3-phase / 480 V+ load — requires 3-phase inverter or step-up transformer");
  if (lrc > invKW * 2.5 * 1000 / volts)
    warns.push(`⚠ Motor LRC (${lrc.toFixed(0)}A) may exceed inverter surge; verify with manufacturer`);
  if (strs > 8)
    warns.push(`⚠ ${strs} PV strings — consider multiple MPPT inputs or sub-combiners`);
  if (bNum > 8)
    warns.push(`⚠ Large battery bank — confirm BMS communications and string balancing`);

  return {flc,lrc,pKW,surgeKW,mCA,mOCPD,mWire,kwhD,needKW,numP,pvKW,pps,strs,
          VOC,VMP,ISC,IMP,PW,pvCA,pvFuse,pvWire,dcBA,dcCA,dcFuse,dcWire,dod,chem,bModKwh,bReq,
          bNum,bKwh,bA,bOCP,bWir,invKW,invAC,invOCP,invWir,minKW,pvU,dcU,bU,acU,mU,cc,warns};
}

/* ═══════════════════════════════════════════════════════════════
   SVG ATOMS  — light-mode fills
═══════════════════════════════════════════════════════════════ */
const PVPanel = ({x,y,w,h,color,s1,s2,dim}) => (
  <g opacity={dim?0.28:1}>
    <rect x={x} y={y} width={w} height={h} rx={3} fill="#eef6ff" stroke={color} strokeWidth={1.5}/>
    {[1,2,3].map(i=><line key={`h${i}`} x1={x+5} y1={y+h*i/4} x2={x+w-5} y2={y+h*i/4} stroke={color} strokeWidth={0.5} opacity={0.35}/>)}
    {[1,2].map(i=><line key={`v${i}`} x1={x+w*i/3} y1={y+5} x2={x+w*i/3} y2={y+h-5} stroke={color} strokeWidth={0.5} opacity={0.35}/>)}
    <text x={x+w/2} y={y+h/2-4} textAnchor="middle" fill={color} fontSize={8.5} fontWeight="bold">{s1}</text>
    {s2&&<text x={x+w/2} y={y+h/2+9} textAnchor="middle" fill={color} fontSize={7} opacity={0.8}>{s2}</text>}
  </g>
);

const FuseSym = ({x,y,color}) => (
  <g>
    <ellipse cx={x} cy={y} rx={9} ry={6} fill="#ffffff" stroke={color} strokeWidth={1.5}/>
    <line x1={x-5} y1={y} x2={x+5} y2={y} stroke={color} strokeWidth={2}/>
  </g>
);

const BkrSym = ({x,y,color}) => (
  <g>
    <rect x={x-9} y={y-7} width={18} height={14} rx={2} fill="#ffffff" stroke={color} strokeWidth={1.5}/>
    <line x1={x-5} y1={y+4} x2={x+5} y2={y-4} stroke={color} strokeWidth={2}/>
  </g>
);

const DiscSym = ({x,y,color,vert=true}) => vert ? (
  <g>
    <line x1={x} y1={y-14} x2={x} y2={y-5} stroke={color} strokeWidth={2}/>
    <line x1={x} y1={y+5} x2={x} y2={y+14} stroke={color} strokeWidth={2}/>
    <circle cx={x} cy={y-5} r={2.5} fill={color}/>
    <circle cx={x} cy={y+5} r={2.5} fill={color}/>
    <line x1={x} y1={y-5} x2={x+13} y2={y-14} stroke={color} strokeWidth={2}/>
  </g>
) : (
  <g>
    <line x1={x-14} y1={y} x2={x-5} y2={y} stroke={color} strokeWidth={2}/>
    <line x1={x+5} y1={y} x2={x+14} y2={y} stroke={color} strokeWidth={2}/>
    <circle cx={x-5} cy={y} r={2.5} fill={color}/>
    <circle cx={x+5} cy={y} r={2.5} fill={color}/>
    <line x1={x-5} y1={y} x2={x+10} y2={y-8} stroke={color} strokeWidth={2}/>
  </g>
);

const GndSym = ({x,y,color="#94a3b8"}) => (
  <g>
    <line x1={x} y1={y} x2={x} y2={y+8} stroke={color} strokeWidth={1.5}/>
    <line x1={x-10} y1={y+8} x2={x+10} y2={y+8} stroke={color} strokeWidth={2}/>
    <line x1={x-6} y1={y+12} x2={x+6} y2={y+12} stroke={color} strokeWidth={1.5}/>
    <line x1={x-3} y1={y+16} x2={x+3} y2={y+16} stroke={color} strokeWidth={1}/>
  </g>
);

const FlowArrow = ({x,y,dx,dy,color}) => {
  const len=Math.sqrt(dx*dx+dy*dy)||1, ux=dx/len, uy=dy/len, ar=7;
  return <polygon
    points={`${x+ux*ar},${y+uy*ar} ${x-ux*ar+uy*ar*0.65},${y-uy*ar-ux*ar*0.65} ${x-ux*ar-uy*ar*0.65},${y-uy*ar+ux*ar*0.65}`}
    fill={color}/>;
};

const UtilityGridSym = ({x, y, color}) => (
  <g>
    <text x={x} y={y-14} textAnchor="middle" fill={color} fontSize={6} letterSpacing={1} fontWeight="bold">&#9889; UTILITY</text>
    <text x={x} y={y-6} textAnchor="middle" fill={color} fontSize={5.5} letterSpacing={1}>GRID TIE</text>
    <line x1={x} y1={y} x2={x} y2={y+22} stroke={color} strokeWidth={2.5}/>
    <line x1={x-16} y1={y+6} x2={x+16} y2={y+6} stroke={color} strokeWidth={2}/>
    <line x1={x-14} y1={y+6} x2={x-14} y2={y+14} stroke={color} strokeWidth={1.5}/>
    <line x1={x+14} y1={y+6} x2={x+14} y2={y+14} stroke={color} strokeWidth={1.5}/>
    <circle cx={x-14} cy={y+16} r={2.5} fill="none" stroke={color} strokeWidth={1.5}/>
    <circle cx={x+14} cy={y+16} r={2.5} fill="none" stroke={color} strokeWidth={1.5}/>
  </g>
);

const TransferSwitchSym = ({x, y, color, open}) => (
  <g>
    <rect x={x-14} y={y-12} width={28} height={24} rx={3} fill="#ffffff" stroke={color} strokeWidth={1.5}/>
    <text x={x} y={y-3} textAnchor="middle" fill={color} fontSize={5.5} fontWeight="bold">TS</text>
    {open
      ? <line x1={x-7} y1={y+7} x2={x+7} y2={y+2} stroke={color} strokeWidth={2}/>
      : <line x1={x-7} y1={y+5} x2={x+7} y2={y+5} stroke={color} strokeWidth={2}/>
    }
    <circle cx={x-7} cy={open ? y+7 : y+5} r={2} fill={color}/>
    <circle cx={x+7} cy={open ? y+2 : y+5} r={2} fill={color}/>
  </g>
);

/* ═══════════════════════════════════════════════════════════════
   ONE-LINE DIAGRAM  (SVG — light mode)
═══════════════════════════════════════════════════════════════ */
function OneDiagram({calc, disp, inp}) {
  const {numP,pvKW,strs,pps,ISC,VOC,pvFuse,dcFuse,dcBA,dcWire,invKW,invAC,
         bNum,bKwh,bOCP,mOCPD,flc,invOCP,bA} = calc;

  const pvC=uc(disp.pvU), dcC=uc(disp.dcU), bC=uc(disp.bU), acC=uc(disp.acU), mC=uc(disp.mU);
  const LW = 3;

  // Layout constants
  const PV_Y=30, PV_H=56, PV_W=90;
  const P1X=18, P2X=244, P3X=470;
  const PC=[P1X+PV_W/2, P2X+PV_W/2, P3X+PV_W/2];

  const FUSE_Y=106, BUS_Y=146, DISC_Y=186;
  const IL=112,IR=468,IT=220,IB=342,ICX=290,ICY=281;
  const BX=46, BD_Y=360, BTKR_Y=385, BT=412, BB=545, BW=60;
  const AX=530, ABK_Y=355, APT=405, APB=458, PBKY=490, MCY=558, MR=32;

  // Grid column constants
  const GRID_X = 628;
  const GRID_TOP_Y = 32;
  const GRID_TS_Y = 372;
  const GRID_BOT_Y = APT;

  const gridColor = disp.gridDown ? '#dc2626' : '#64748b';
  const gridDash  = disp.gridDown ? "7,5" : undefined;
  const gridOpacity = disp.gridDown ? 1 : 0.55;

  const panLabel = s => {
    const active = strs >= s;
    const cnt    = active ? (s===strs ? numP-(s-1)*pps : pps) : pps;
    const panels = Math.min(Math.max(cnt,1), pps);
    return {
      s1: active ? `STR-${s}: ${panels}\xd7${calc.PW}W` : `STR-${s}`,
      s2: active ? `${(VOC*panels).toFixed(0)}Voc \xb7 ${ISC.toFixed(1)}Isc` : `(unused)`,
      dim: !active
    };
  };

  return (
    <svg viewBox="0 0 680 720" style={{width:'100%',maxWidth:720,display:'block',
      fontFamily:"'Space Mono','Courier New',monospace",
      filter:'drop-shadow(0 2px 8px rgba(0,0,0,0.08))'}}>

      {/* White background with light grid */}
      <rect width={680} height={720} fill="#f8fafc" rx={6}/>
      {Array.from({length:22},(_,i)=>(
        <line key={`gr${i}`} x1={0} y1={i*33} x2={680} y2={i*33} stroke="#e8eef4" strokeWidth={0.5}/>
      ))}
      {Array.from({length:18},(_,i)=>(
        <line key={`gc${i}`} x1={i*40} y1={0} x2={i*40} y2={720} stroke="#e8eef4" strokeWidth={0.5}/>
      ))}

      {/* Header */}
      <text x={340} y={17} textAnchor="middle" fill="#94a3b8" fontSize={8} letterSpacing={3}>
        ONE-LINE DIAGRAM — MICROGRID / WELL PUMP SYSTEM — NEC COMPLIANT
      </text>
      <text x={340} y={26} textAnchor="middle" fill="#94a3b8" fontSize={7}>
        PV GENERATION — {numP}\xd7{calc.PW}W = {pvKW.toFixed(2)} kW  \xb7  {strs} strings \xd7 {pps} panels
      </text>

      {/* ─── SOLAR PANELS ─── */}
      {[0,1,2].map(i => {
        const {s1,s2,dim} = panLabel(i+1);
        return <PVPanel key={i} x={[P1X,P2X,P3X][i]} y={PV_Y} w={PV_W} h={PV_H} color={pvC} s1={s1} s2={s2} dim={dim}/>;
      })}
      {strs>3 && <text x={290} y={PV_Y+PV_H+12} textAnchor="middle" fill={pvC} fontSize={7} fontWeight="bold">+{strs-3} additional strings on DC bus</text>}

      {/* String lines + fuses */}
      {PC.map((cx,i) => {
        const active = strs > i;
        const lc = active ? pvC : "#cbd5e1";
        return (
          <g key={`str${i}`}>
            <line x1={cx} y1={PV_Y+PV_H} x2={cx} y2={FUSE_Y-7} stroke={lc} strokeWidth={LW}/>
            <FuseSym x={cx} y={FUSE_Y} color={lc}/>
            {active && <>
              <text x={cx+13} y={FUSE_Y+4} fill={lc} fontSize={7} fontWeight="bold">{pvFuse}A</text>
              <text x={cx} y={FUSE_Y-12} textAnchor="middle" fill="#94a3b8" fontSize={6}>F{i+1}</text>
            </>}
            <line x1={cx} y1={FUSE_Y+7} x2={cx} y2={BUS_Y} stroke={lc} strokeWidth={LW}/>
          </g>
        );
      })}

      {/* DC Combiner Bus */}
      <rect x={28} y={BUS_Y-4} width={524} height={8} rx={1} fill={dcC} opacity={0.15}/>
      <line x1={28} y1={BUS_Y} x2={552} y2={BUS_Y} stroke={dcC} strokeWidth={LW+1}/>
      <text x={290} y={BUS_Y-8} textAnchor="middle" fill="#64748b" fontSize={7}>
        DC COMBINER BUS  {dcBA.toFixed(1)} A  /  {dcFuse} A OCPD  /  {dcWire}
      </text>

      {/* Bus → Disconnect → Inverter */}
      <line x1={ICX} y1={BUS_Y} x2={ICX} y2={DISC_Y-15} stroke={dcC} strokeWidth={LW}/>
      <DiscSym x={ICX} y={DISC_Y} color={dcC} vert={true}/>
      <text x={ICX+20} y={DISC_Y+4} fill="#64748b" fontSize={7}>DC MAIN DISC</text>
      <line x1={ICX} y1={DISC_Y+15} x2={ICX} y2={IT} stroke={dcC} strokeWidth={LW}/>
      <FlowArrow x={ICX} y={DISC_Y+38} dx={0} dy={1} color={dcC}/>

      {/* ─── HYBRID INVERTER BOX ─── */}
      <rect x={IL} y={IT} width={IR-IL} height={IB-IT} rx={4}
        fill="#f0f7ff" stroke="#2563eb" strokeWidth={2}/>
      <rect x={IL} y={IT} width={IR-IL} height={22} rx={3} fill="#dbeafe"/>
      <text x={ICX} y={IT+15} textAnchor="middle" fill="#1e40af" fontSize={10} fontWeight="bold" letterSpacing={1}>
        HYBRID INVERTER / CHARGER
      </text>
      <text x={ICX} y={IT+32} textAnchor="middle" fill="#64748b" fontSize={7.5}>
        Integrated MPPT  \xb7  {invKW} kW Rated  \xb7  Pure Sine  \xb7  VFD Compatible
      </text>
      {/* Zone dividers */}
      <line x1={IL+120} y1={IT+38} x2={IL+120} y2={IB} stroke="#bfdbfe" strokeWidth={1}/>
      <line x1={IR-120} y1={IT+38} x2={IR-120} y2={IB} stroke="#bfdbfe" strokeWidth={1}/>
      {/* Zone labels */}
      <text x={IL+60} y={IT+52} textAnchor="middle" fill="#1d4ed8" fontSize={7.5} fontWeight="bold">PV / MPPT IN</text>
      <text x={IL+60} y={IT+63} textAnchor="middle" fill="#64748b" fontSize={6.5}>{pvKW.toFixed(2)} kW  60–550 V</text>
      <text x={ICX} y={IT+52} textAnchor="middle" fill="#6d28d9" fontSize={7.5} fontWeight="bold">BATT IN / OUT</text>
      <text x={ICX} y={IT+63} textAnchor="middle" fill="#64748b" fontSize={6.5}>{inp.sv} V DC  BATT BUS</text>
      <text x={IR-60} y={IT+52} textAnchor="middle" fill="#c2410c" fontSize={7.5} fontWeight="bold">AC OUTPUT</text>
      <text x={IR-60} y={IT+63} textAnchor="middle" fill="#64748b" fontSize={6.5}>240 V / 1φ  {invAC.toFixed(1)} A</text>
      <text x={ICX} y={IT+82} textAnchor="middle" fill="#94a3b8" fontSize={7}>
        Surge: {(invKW*2.5).toFixed(0)} kW  \xb7  Eff ≥ 96%  \xb7  Anti-Island  \xb7  Generator Input  \xb7  AGS
      </text>
      <text x={ICX} y={IT+95} textAnchor="middle" fill="#94a3b8" fontSize={7}>
        AC OCPD: {invOCP} A  \xb7  Suggested: Victron \xb7 Sol-Ark \xb7 Schneider XW+ \xb7 Growatt SPF
      </text>

      {/* ─── BATTERY BRANCH (left) ─── */}
      <line x1={IL} y1={ICY} x2={BX} y2={ICY} stroke={bC} strokeWidth={LW}/>
      <FlowArrow x={BX+40} y={ICY} dx={-1} dy={0} color={bC}/>
      <text x={(IL+BX)/2} y={ICY-7} textAnchor="middle" fill={bC} fontSize={7} fontWeight="bold">{bA.toFixed(1)} A DC</text>
      <line x1={BX} y1={ICY} x2={BX} y2={BD_Y-15} stroke={bC} strokeWidth={LW}/>
      <DiscSym x={BX} y={BD_Y} color={bC} vert={true}/>
      <text x={BX+18} y={BD_Y+4} fill="#64748b" fontSize={7}>BATT DISC</text>
      <line x1={BX} y1={BD_Y+15} x2={BX} y2={BTKR_Y-8} stroke={bC} strokeWidth={LW}/>
      <BkrSym x={BX} y={BTKR_Y} color={bC}/>
      <text x={BX+13} y={BTKR_Y+4} fill={bC} fontSize={7} fontWeight="bold">{bOCP}A</text>
      <text x={BX+13} y={BTKR_Y+14} fill="#64748b" fontSize={6}>NEC 480</text>
      <line x1={BX} y1={BTKR_Y+8} x2={BX} y2={BT} stroke={bC} strokeWidth={LW}/>
      <FlowArrow x={BX} y={BTKR_Y+32} dx={0} dy={1} color={bC}/>

      {/* Battery symbol */}
      <rect x={BX-BW/2} y={BT} width={BW} height={BB-BT} rx={4} fill="#f0fdf4" stroke={bC} strokeWidth={1.5}/>
      {Array.from({length:Math.min(bNum,6)},(_,i) => {
        const cH = (BB-BT-18) / Math.min(bNum,6);
        return <rect key={i} x={BX-BW/2+7} y={BT+9+i*cH} width={BW-14} height={cH-3} rx={1} fill={bC} opacity={0.2}/>;
      })}
      <text x={BX} y={BT+(BB-BT)/2-10} textAnchor="middle" fill={bC} fontSize={8} fontWeight="bold">BATTERY</text>
      <text x={BX} y={BT+(BB-BT)/2+3} textAnchor="middle" fill={bC} fontSize={7.5}>{bKwh.toFixed(1)} kWh</text>
      <text x={BX} y={BT+(BB-BT)/2+16} textAnchor="middle" fill={bC} fontSize={6.5}>{bNum}\xd7{inp.sv}V {calc.chem.toUpperCase()}</text>
      <GndSym x={BX} y={BB+2}/>
      <text x={BX} y={BB+24} textAnchor="middle" fill="#94a3b8" fontSize={6}>SYS NEG / GND</text>

      {/* ─── AC BRANCH (right) ─── */}
      <line x1={IR} y1={ICY} x2={AX} y2={ICY} stroke={acC} strokeWidth={LW}/>
      <FlowArrow x={AX-35} y={ICY} dx={1} dy={0} color={acC}/>
      <text x={(IR+AX)/2} y={ICY-7} textAnchor="middle" fill={acC} fontSize={7} fontWeight="bold">{flc.toFixed(1)} A AC</text>
      <line x1={AX} y1={ICY} x2={AX} y2={ABK_Y-8} stroke={acC} strokeWidth={LW}/>
      <BkrSym x={AX} y={ABK_Y} color={acC}/>
      <text x={AX-13} y={ABK_Y+4} fill={acC} fontSize={7} fontWeight="bold" textAnchor="end">{invOCP}A</text>
      <text x={AX-13} y={ABK_Y+14} fill="#64748b" fontSize={6} textAnchor="end">AC MAIN</text>
      <line x1={AX} y1={ABK_Y+8} x2={AX} y2={APT} stroke={acC} strokeWidth={LW}/>
      <FlowArrow x={AX} y={ABK_Y+36} dx={0} dy={1} color={acC}/>

      {/* AC Panel */}
      <rect x={AX-34} y={APT} width={68} height={APB-APT} rx={3} fill="#fff7ed" stroke={acC} strokeWidth={1.5}/>
      <rect x={AX-34} y={APT} width={68} height={18} rx={2} fill={`${acC}20`}/>
      <text x={AX} y={APT+13} textAnchor="middle" fill={acC} fontSize={8} fontWeight="bold">AC PANEL</text>
      <text x={AX} y={APT+28} textAnchor="middle" fill="#64748b" fontSize={7}>240 V / 1φ</text>
      <text x={AX} y={APT+39} textAnchor="middle" fill="#64748b" fontSize={6.5}>60 Hz \xb7 {invOCP}A</text>
      <text x={AX} y={APT+50} textAnchor="middle" fill="#94a3b8" fontSize={6}>NEC Art. 240</text>

      {/* Pump breaker + motor */}
      <line x1={AX} y1={APB} x2={AX} y2={PBKY-8} stroke={mC} strokeWidth={LW}/>
      <FlowArrow x={AX} y={APB+18} dx={0} dy={1} color={mC}/>
      <BkrSym x={AX} y={PBKY} color={mC}/>
      <text x={AX-13} y={PBKY+4} fill={mC} fontSize={7} fontWeight="bold" textAnchor="end">{mOCPD}A</text>
      <text x={AX-13} y={PBKY+14} fill="#64748b" fontSize={6} textAnchor="end">NEC 430.52</text>
      <line x1={AX} y1={PBKY+8} x2={AX} y2={MCY-MR} stroke={mC} strokeWidth={LW}/>

      {/* Motor */}
      <circle cx={AX} cy={MCY} r={MR} fill="#fefce8" stroke={mC} strokeWidth={2}/>
      <circle cx={AX} cy={MCY} r={MR*0.82} fill="none" stroke={mC} strokeWidth={0.5} opacity={0.4}/>
      <text x={AX} y={MCY-5} textAnchor="middle" fill={mC} fontSize={15} fontWeight="bold">M</text>
      <text x={AX} y={MCY+9} textAnchor="middle" fill={mC} fontSize={7}>{inp.hp}HP \xb7 {inp.volts}V/{inp.phase}φ</text>
      <text x={AX} y={MCY+20} textAnchor="middle" fill={mC} fontSize={6.5}>FLC:{flc.toFixed(1)}A  LRC:{calc.lrc.toFixed(1)}A</text>
      <text x={AX} y={MCY-MR-8} textAnchor="middle" fill="#64748b" fontSize={7} fontWeight="bold">SUBMERSIBLE WELL PUMP</text>
      <GndSym x={AX} y={MCY+MR+2}/>

      {/* Inverter chassis ground */}
      <line x1={ICX} y1={IB} x2={ICX} y2={IB+20} stroke="#94a3b8" strokeWidth={1.5}/>
      <GndSym x={ICX} y={IB+20}/>
      <text x={ICX+18} y={IB+32} fill="#94a3b8" fontSize={6}>CHASSIS GND</text>

      {/* ─── UTILITY GRID CONNECTION (right column) ─── */}
      <UtilityGridSym x={GRID_X} y={GRID_TOP_Y+16} color={gridColor}/>
      <line x1={GRID_X} y1={GRID_TOP_Y+38} x2={GRID_X} y2={GRID_TS_Y-13}
        stroke={gridColor} strokeWidth={2} strokeDasharray={gridDash} opacity={gridOpacity}/>
      <TransferSwitchSym x={GRID_X} y={GRID_TS_Y} color={gridColor} open={disp.gridDown}/>
      <line x1={GRID_X} y1={GRID_TS_Y+13} x2={GRID_X} y2={GRID_BOT_Y+9}
        stroke={gridColor} strokeWidth={2} strokeDasharray={gridDash} opacity={gridOpacity}/>
      <line x1={GRID_X} y1={GRID_BOT_Y+9} x2={AX+35} y2={GRID_BOT_Y+9}
        stroke={gridColor} strokeWidth={2} strokeDasharray={gridDash} opacity={gridOpacity}/>
      {!disp.gridDown && (
        <text x={(GRID_X+AX+35)/2} y={GRID_BOT_Y+6} textAnchor="middle" fill="#94a3b8" fontSize={6}>GRID BACKUP</text>
      )}

      {/* Grid failure overlays */}
      {disp.gridDown && <>
        <line x1={GRID_X-10} y1={GRID_TS_Y-8} x2={GRID_X+10} y2={GRID_TS_Y+8} stroke="#dc2626" strokeWidth={2.5}/>
        <line x1={GRID_X+10} y1={GRID_TS_Y-8} x2={GRID_X-10} y2={GRID_TS_Y+8} stroke="#dc2626" strokeWidth={2.5}/>
        <rect x={GRID_X-26} y={GRID_TOP_Y+38} width={52} height={15} rx={3} fill="#fef2f2" stroke="#dc2626" strokeWidth={1}/>
        <text x={GRID_X} y={GRID_TOP_Y+49} textAnchor="middle" fill="#dc2626" fontSize={7} fontWeight="bold">GRID FAULT</text>
        <rect x={BX-40} y={ICY-24} width={80} height={13} rx={3} fill="#fef2f2" stroke="#dc2626" strokeWidth={1}/>
        <text x={BX} y={ICY-14} textAnchor="middle" fill="#dc2626" fontSize={6.5} fontWeight="bold">&#9889; PRIMARY SOURCE</text>
      </>}

      {/* ─── STATUS BADGES ─── */}
      {[
        {label:'PV ARRAY', pct:disp.pvU, cx:95},
        {label:'DC BUS',   pct:disp.dcU, cx:193},
        {label:'BATTERY',  pct:disp.bU,  cx:291},
        {label:'AC OUT',   pct:disp.acU, cx:389},
        {label:'PUMP MTR', pct:disp.mU,  cx:487},
        {label:'GRID',     pct:disp.gridDown ? 120 : 30, cx:585},
      ].map(({label,pct,cx}) => {
        const isGrid = label === 'GRID';
        const displayText = isGrid ? (disp.gridDown ? 'FAULT' : 'CONNECTED') : ut(pct);
        const pctText = isGrid ? (disp.gridDown ? '---' : 'OK') : (pct<=0?'---':`${pct.toFixed(0)}%`);
        return (
          <g key={label}>
            <rect x={cx-45} y={678} width={90} height={36} rx={3}
              fill={ubg(pct)} stroke={uc(pct)} strokeWidth={1.5}/>
            <text x={cx} y={691} textAnchor="middle" fill={uc(pct)} fontSize={7} fontWeight="bold">{label}</text>
            <text x={cx} y={703} textAnchor="middle" fill={uc(pct)} fontSize={7.5} fontWeight="bold">{displayText}</text>
            <text x={cx} y={711} textAnchor="middle" fill={uc(pct)} fontSize={6}>{pctText}</text>
          </g>
        );
      })}

      {/* Legend */}
      <text x={8} y={674} fill="#94a3b8" fontSize={6.5} fontWeight="bold">STATUS:</text>
      {[['IDLE','#2563eb'],['NORMAL','#16a34a'],['CAUTION','#ca8a04'],['WARNING','#ea580c'],['OC!','#dc2626']].map(([l,c],i)=>(
        <g key={c}>
          <rect x={50+i*52} y={666} width={9} height={9} rx={2} fill={c}/>
          <text x={62+i*52} y={674} fill="#64748b" fontSize={6.5}>{l}</text>
        </g>
      ))}
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════
   INPUT PANEL — light mode
═══════════════════════════════════════════════════════════════ */
const Sl = {
  sec: {fontSize:8, color:'#1d4ed8', letterSpacing:3, borderBottom:'1px solid #e2e8f0',
        paddingBottom:4, marginBottom:8, marginTop:14, fontWeight:'bold'},
  lbl: {display:'block', fontSize:8, color:'#475569', marginBottom:3, textTransform:'uppercase', letterSpacing:1},
  sel: {width:'100%', background:'#ffffff', border:'1px solid #cbd5e1', color:'#1e293b',
        padding:'5px 8px', borderRadius:4, fontSize:11, fontFamily:'inherit', cursor:'pointer'},
  row: {marginBottom:10},
  val: {float:'right', color:'#1d4ed8', fontWeight:'bold'},
};

function InputPanel({inp, upd, panelId, setPanelId, customPanel, setCustomPanel,
                     batteryId, setBatteryId, customBattery, setCustomBattery, activePanel, activeBattery}) {
  return (
    <div style={{padding:'8px 12px'}}>
      <div style={{fontSize:9,color:'#1d4ed8',letterSpacing:3,textAlign:'center',marginBottom:10,
                   borderBottom:'1px solid #e2e8f0',paddingBottom:8,fontWeight:'bold'}}>
        &#9881; SYSTEM INPUTS
      </div>

      <div style={Sl.sec}>PUMP LOAD</div>

      <div style={Sl.row}>
        <label style={Sl.lbl}>Motor HP</label>
        <select style={Sl.sel} value={inp.hp} onChange={e=>upd('hp',+e.target.value)}>
          {[0.5,0.75,1,1.5,2,3,5,7.5,10,15,20].map(v=><option key={v} value={v}>{v} HP</option>)}
        </select>
      </div>

      <div style={Sl.row}>
        <label style={Sl.lbl}>Supply Voltage</label>
        <select style={Sl.sel} value={inp.volts} onChange={e=>upd('volts',+e.target.value)}>
          {[120,208,240,480,600].map(v=><option key={v} value={v}>{v} V</option>)}
        </select>
      </div>

      <div style={Sl.row}>
        <label style={Sl.lbl}>Phase</label>
        <select style={Sl.sel} value={inp.phase} onChange={e=>upd('phase',+e.target.value)}>
          <option value={1}>1-Phase (Single)</option>
          <option value={3}>3-Phase</option>
        </select>
      </div>

      <div style={Sl.row}>
        <label style={Sl.lbl}>Daily Runtime <span style={Sl.val}>{inp.hrs} h/day</span></label>
        <input type="range" style={{width:'100%',accentColor:'#2563eb'}} min={0.5} max={24} step={0.5}
          value={inp.hrs} onChange={e=>upd('hrs',+e.target.value)}/>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:7.5,color:'#94a3b8',marginTop:1}}>
          <span>0.5h</span><span>12h</span><span>24h</span>
        </div>
      </div>

      <div style={Sl.sec}>SITE CONDITIONS</div>

      <div style={Sl.row}>
        <label style={Sl.lbl}>Peak Sun Hours <span style={Sl.val}>{inp.sun} PSH</span></label>
        <input type="range" style={{width:'100%',accentColor:'#d97706'}} min={2} max={8} step={0.25}
          value={inp.sun} onChange={e=>upd('sun',+e.target.value)}/>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:7.5,color:'#94a3b8',marginTop:1}}>
          <span>2 (low)</span><span>5 (TX avg)</span><span>8 (SW)</span>
        </div>
        <div style={{fontSize:7.5,color:'#64748b',marginTop:4,background:'#f1f5f9',
                     padding:'3px 7px',borderRadius:3,border:'1px solid #e2e8f0'}}>
          {inp.sun<3.5?'Low (cloudy/NW)':inp.sun<4.5?'Moderate':inp.sun<6?'Good — TX / NM / AZ':inp.sun<7?'Excellent — SW Desert':'Peak — Mojave / El Paso'}
        </div>
      </div>

      <div style={Sl.sec}>SOLAR PANELS</div>

      <div style={Sl.row}>
        <label style={Sl.lbl}>Panel Model</label>
        <select style={Sl.sel} value={panelId} onChange={e => setPanelId(e.target.value)}>
          {PANELS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {panelId !== 'custom' && activePanel && (
          <div style={{fontSize:7, color:'#64748b', marginTop:4, lineHeight:1.6}}>
            Pmax: {activePanel.Pmax}W \xb7 Voc: {activePanel.Voc}V \xb7 Vmp: {activePanel.Vmp}V<br/>
            Isc: {activePanel.Isc}A \xb7 Imp: {activePanel.Imp}A
          </div>
        )}
        {panelId === 'custom' && (
          <div style={{marginTop:6, border:'1px solid #dbeafe', borderRadius:4, padding:'6px 8px', background:'#eff6ff'}}>
            <div style={{fontSize:7, color:'#1d4ed8', fontWeight:'bold', marginBottom:4, letterSpacing:1}}>NAMEPLATE DATA</div>
            {[
              {key:'Pmax', label:'Max Power (W)',        step:1,    min:1},
              {key:'Voc',  label:'Open Circuit V (Voc)', step:0.1,  min:0.1},
              {key:'Vmp',  label:'Max Power V (Vmp)',    step:0.1,  min:0.1},
              {key:'Isc',  label:'Short Circuit A (Isc)',step:0.01, min:0.01},
              {key:'Imp',  label:'Max Power A (Imp)',    step:0.01, min:0.01},
            ].map(({key, label, step, min}) => (
              <div key={key} style={{marginBottom:5}}>
                <label style={{...Sl.lbl, marginBottom:1}}>{label}</label>
                <input type="number" step={step} min={min}
                  value={customPanel[key]}
                  onChange={e => setCustomPanel(p => ({...p, [key]: +e.target.value}))}
                  style={{width:'100%', padding:'3px 7px', borderRadius:3, border:'1px solid #bfdbfe',
                          background:'#ffffff', color:'#1e293b', fontSize:10, fontFamily:'inherit', outline:'none'}}/>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={Sl.sec}>BATTERY STORAGE</div>

      <div style={Sl.row}>
        <label style={Sl.lbl}>Battery Module</label>
        <select style={Sl.sel} value={batteryId} onChange={e => setBatteryId(e.target.value)}>
          {BATTERIES.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {batteryId !== 'custom' && activeBattery && (
          <div style={{fontSize:7, color:'#64748b', marginTop:4, lineHeight:1.6}}>
            {activeBattery.kWh} kWh \xb7 DoD: {(activeBattery.dod*100).toFixed(0)}% \xb7 {activeBattery.chem.toUpperCase()}
          </div>
        )}
        {batteryId === 'custom' && (
          <div style={{marginTop:6, border:'1px solid #dcfce7', borderRadius:4, padding:'6px 8px', background:'#f0fdf4'}}>
            <div style={{fontSize:7, color:'#16a34a', fontWeight:'bold', marginBottom:4, letterSpacing:1}}>NAMEPLATE DATA</div>
            <div style={{marginBottom:5}}>
              <label style={{...Sl.lbl, marginBottom:1}}>Module kWh</label>
              <input type="number" step={0.01} min={0.1}
                value={customBattery.kWh}
                onChange={e => setCustomBattery(p => ({...p, kWh: +e.target.value}))}
                style={{width:'100%', padding:'3px 7px', borderRadius:3, border:'1px solid #bbf7d0',
                        background:'#ffffff', color:'#1e293b', fontSize:10, fontFamily:'inherit', outline:'none'}}/>
            </div>
            <div style={{marginBottom:5}}>
              <label style={{...Sl.lbl, marginBottom:1}}>Depth of Discharge (%)</label>
              <input type="number" step={1} min={10} max={100}
                value={Math.round(customBattery.dod*100)}
                onChange={e => setCustomBattery(p => ({...p, dod: +e.target.value/100}))}
                style={{width:'100%', padding:'3px 7px', borderRadius:3, border:'1px solid #bbf7d0',
                        background:'#ffffff', color:'#1e293b', fontSize:10, fontFamily:'inherit', outline:'none'}}/>
            </div>
            <div style={{marginBottom:2}}>
              <label style={{...Sl.lbl, marginBottom:1}}>Chemistry</label>
              <select style={{...Sl.sel, border:'1px solid #bbf7d0'}}
                value={customBattery.chem}
                onChange={e => setCustomBattery(p => ({...p, chem: e.target.value}))}>
                <option value="lfp">LiFePO4 (LFP)</option>
                <option value="agm">AGM Lead Acid</option>
                <option value="fla">Flooded Lead Acid</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div style={Sl.row}>
        <label style={Sl.lbl}>Autonomy <span style={Sl.val}>{inp.days} day{inp.days!==1?'s':''}</span></label>
        <input type="range" style={{width:'100%',accentColor:'#16a34a'}} min={0.5} max={5} step={0.5}
          value={inp.days} onChange={e=>upd('days',+e.target.value)}/>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:7.5,color:'#94a3b8',marginTop:1}}>
          <span>0.5d</span><span>2.5d</span><span>5d</span>
        </div>
      </div>

      {/* Chemistry info blurb from active battery */}
      {activeBattery && (
        <div style={{fontSize:7.5,color:'#64748b',marginTop:4,marginBottom:8}}>
          {activeBattery.chem==='lfp'?'DoD: 80% \xb7 3000+ cycles \xb7 no maintenance':
           activeBattery.chem==='agm'?'DoD: 50% \xb7 500–800 cycles \xb7 sealed':
           'DoD: 40% \xb7 300–500 cycles \xb7 vented enclosure reqd'}
        </div>
      )}

      <div style={Sl.sec}>SYSTEM CONFIG</div>

      <div style={Sl.row}>
        <label style={Sl.lbl}>DC Bus Voltage</label>
        <select style={Sl.sel} value={inp.sv} onChange={e=>upd('sv',+e.target.value)}>
          <option value={24}>24 V (small / &lt;2 kW systems)</option>
          <option value={48}>48 V (recommended standard)</option>
        </select>
      </div>

      <div style={{marginTop:16,padding:'8px 10px',background:'#f1f5f9',borderRadius:4,
                   border:'1px solid #e2e8f0',fontSize:7.5,color:'#64748b',lineHeight:1.7}}>
        NEC 690 (PV) \xb7 NEC 480 (Battery)<br/>
        NEC 430 (Motor) \xb7 NEC 310.15 (Wire)<br/>
        Cu conductors \xb7 75\xb0C \xb7 in conduit<br/>
        Values are design minimums. Verify with AHJ.
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SPECS PANEL — light mode
═══════════════════════════════════════════════════════════════ */
function SR({label, value, sub, color, warn}) {
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',
                 padding:'4px 0',borderBottom:'1px solid #f1f5f9'}}>
      <span style={{fontSize:8.5,color:'#475569',flex:1,paddingRight:6}}>{label}</span>
      <div style={{textAlign:'right',minWidth:0}}>
        <span style={{fontSize:9.5,color:color||'#334155',fontWeight:'bold',display:'block'}}>{value}</span>
        {sub  && <span style={{fontSize:7,color:'#94a3b8',display:'block'}}>{sub}</span>}
        {warn && <span style={{fontSize:7,color:'#dc2626',fontWeight:'bold',display:'block'}}>{warn}</span>}
      </div>
    </div>
  );
}

function Sec({title, color="#2563eb", children}) {
  return (
    <div style={{marginBottom:10,border:`1px solid ${color}30`,borderRadius:4,overflow:'hidden',background:'#ffffff'}}>
      <div style={{background:`${color}12`,padding:'5px 10px',fontSize:8,color,letterSpacing:2,fontWeight:'bold',
                   borderBottom:`1px solid ${color}20`}}>{title}</div>
      <div style={{padding:'5px 10px 8px'}}>{children}</div>
    </div>
  );
}

function SpecsPanel({calc, inp, panelName, batteryName}) {
  const {flc,lrc,pKW,surgeKW,mCA,mOCPD,mWire,kwhD,needKW,numP,pvKW,strs,pps,
         ISC,VOC,VMP,IMP,PW,pvFuse,pvWire,dcFuse,dcWire,dcBA,bNum,bKwh,bReq,bA,bOCP,bWir,
         invKW,invAC,invOCP,invWir,minKW,cc,warns,dod,chem,bModKwh} = calc;

  return (
    <div style={{padding:'6px 10px',fontSize:10}}>
      <div style={{fontSize:9,color:'#1d4ed8',letterSpacing:3,textAlign:'center',marginBottom:10,
                   borderBottom:'1px solid #e2e8f0',paddingBottom:8,fontWeight:'bold'}}>
        SYSTEM SPECIFICATIONS
      </div>

      {warns.length > 0 && (
        <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:4,
                     padding:'7px 10px',marginBottom:10}}>
          <div style={{fontSize:7.5,color:'#b91c1c',fontWeight:'bold',marginBottom:3}}>⚠ DESIGN ALERTS</div>
          {warns.map((w,i)=><div key={i} style={{fontSize:8,color:'#dc2626',marginBottom:2}}>{w}</div>)}
        </div>
      )}

      <Sec title="PUMP MOTOR — NEC ART. 430" color="#ea580c">
        <SR label="Rating"         value={`${inp.hp} HP / ${inp.volts}V / ${inp.phase}φ`} color="#334155"/>
        <SR label="Shaft Power"    value={`${pKW.toFixed(2)} kW`} color="#334155"/>
        <SR label="FLC (Running)"  value={`${flc.toFixed(1)} A`}  color="#16a34a"/>
        <SR label="LRC (Starting)" value={`${lrc.toFixed(1)} A`}  color="#ea580c" sub="6.5 \xd7 FLC — locked rotor"/>
        <SR label="Surge Demand"   value={`${surgeKW.toFixed(1)} kW`} color="#ca8a04"/>
        <SR label="Daily Energy"   value={`${kwhD.toFixed(2)} kWh/day`} sub={`${inp.hrs}h \xd7 ${pKW.toFixed(2)}kW`} color="#334155"/>
        <SR label="Branch Wire"    value={mWire}   sub={`${mCA.toFixed(1)} A (125% FLC)`} color="#334155"/>
        <SR label="Motor OCPD"     value={`${mOCPD} A CB`} sub="250% FLC — NEC 430.52" color="#334155"/>
      </Sec>

      <Sec title="PV ARRAY — NEC ART. 690" color="#d97706">
        <SR label="Panel Model"     value={panelName} color="#334155"/>
        <SR label="Required Array"  value={`${needKW.toFixed(2)} kW`} sub={`${kwhD.toFixed(2)} kWh \xf7 ${inp.sun} PSH \xd7 0.78`} color="#334155"/>
        <SR label="Installed Array" value={`${pvKW.toFixed(2)} kW`}  color="#16a34a" sub={`${numP} \xd7 ${PW} W panels`}/>
        <SR label="String Config"   value={`${strs} \xd7 ${pps} panels`} sub={`${(VOC*pps).toFixed(0)}Voc \xb7 ${(VMP*pps).toFixed(0)}Vmp per string`} color="#334155"/>
        <SR label="Voc / Vmp"       value={`${VOC} V / ${VMP} V`} sub="per panel" color="#334155"/>
        <SR label="Isc / Imp"       value={`${ISC} A / ${IMP} A`} sub="per panel" color="#334155"/>
        <SR label="String Fuse"     value={`${pvFuse} A`} sub="1.56 \xd7 Isc — NEC 690.8" color="#334155"/>
        <SR label="String Wire"     value={pvWire} sub={`${calc.pvCA.toFixed(1)} A (156% Isc)`} color="#334155"/>
        <SR label="DC Bus Current"  value={`${dcBA.toFixed(1)} A`} color="#334155"/>
        <SR label="DC Bus Fuse"     value={`${dcFuse} A`} color="#334155"/>
        <SR label="DC Bus Wire"     value={dcWire} sub={`${calc.dcCA.toFixed(1)} A`} color="#334155"/>
      </Sec>

      <Sec title="BATTERY BANK — NEC ART. 480" color="#16a34a">
        <SR label="Module"          value={batteryName} color="#334155"/>
        <SR label="Required"        value={`${bReq.toFixed(1)} kWh`} sub={`${kwhD.toFixed(2)} \xd7 ${inp.days}d \xf7 ${dod}`} color="#334155"/>
        <SR label="Installed"       value={`${bKwh.toFixed(1)} kWh`} color="#16a34a" sub={`${bNum} \xd7 ${bModKwh} kWh modules`}/>
        <SR label="Chemistry"       value={chem.toUpperCase()} sub={chem==='lfp'?'LiFePO4 — Recommended':chem==='agm'?'AGM Lead Acid':'Flooded Lead Acid'} color="#334155"/>
        <SR label="Max Discharge"   value={`${bA.toFixed(1)} A DC`} sub={`at ${inp.sv}V bus (+10% headroom)`} color="#334155"/>
        <SR label="Battery OCPD"    value={`${bOCP} A`} sub="1.25 \xd7 discharge — NEC 480" color="#334155"/>
        <SR label="Battery Wire"    value={bWir} color="#334155"/>
        <SR label="Depth of Disch." value={`${(dod*100).toFixed(0)}%`}
          sub={chem==='lfp'?'3000+ cycle life':'Reduced — consider LFP upgrade'}
          color="#334155"
          warn={chem!=='lfp'?'↑ More modules needed vs LFP':undefined}/>
      </Sec>

      <Sec title="HYBRID INVERTER — NEC ART. 705" color="#2563eb">
        <SR label="Min. Required"   value={`${minKW.toFixed(1)} kW`} sub="Motor surge + 80% rule" color="#334155"/>
        <SR label="Selected Size"   value={`${invKW} kW`} color="#16a34a" sub="Standard inverter unit"/>
        <SR label="Surge Rating"    value={`${(invKW*2.5).toFixed(0)} kW`} sub="Handles motor LRC at start" color="#334155"/>
        <SR label="AC Output"       value={`${invAC.toFixed(1)} A / 240 V`} sub="1φ pure sine wave" color="#334155"/>
        <SR label="AC OCPD"         value={`${invOCP} A`} color="#334155"/>
        <SR label="AC Wire"         value={invWir} color="#334155"/>
        <SR label="MPPT Input"      value="60 – 550 V DC" sub="Check inverter datasheet" color="#334155"/>
        <SR label="Batt Voltage"    value={`${inp.sv} V DC bus`} color="#334155"/>
      </Sec>

      <Sec title="WIRE SCHEDULE" color="#0284c7">
        {[
          ['PV String Circuit',  pvWire, `NEC 690.8 \xb7 ${calc.pvCA.toFixed(1)} A`],
          ['DC Combiner → Inv.', dcWire, `NEC 690.8 \xb7 ${calc.dcCA.toFixed(1)} A`],
          ['Battery ↔ Inv.',     bWir,   `NEC 480 \xb7 ${(bA*1.25).toFixed(1)} A`],
          ['Inv. AC Output',     invWir, `NEC 310.15 \xb7 ${invAC.toFixed(1)} A`],
          ['Motor Branch',       mWire,  `NEC 430 \xb7 ${mCA.toFixed(1)} A`],
        ].map(([l,v,s])=><SR key={l} label={l} value={v} sub={s} color="#0284c7"/>)}
        <div style={{fontSize:7,color:'#94a3b8',marginTop:5}}>
          Copper \xb7 THWN-2 or USE-2 \xb7 75\xb0C \xb7 In conduit \xb7 NEC Table 310.15
        </div>
      </Sec>

      <Sec title="COST ESTIMATE (ROM)" color="#7c3aed">
        <SR label="PV Panels + Racking" value={`$${cc.pv.toLocaleString()}`}   sub={`${numP} panels @ ~$0.80/W`} color="#334155"/>
        <SR label="Battery Modules"      value={`$${cc.batt.toLocaleString()}`} sub={`${bNum} \xd7 ~$1,100/mod`} color="#334155"/>
        <SR label="Inverter / Charger"   value={`$${cc.inv.toLocaleString()}`} color="#334155"/>
        <SR label="Wiring & Conduit"     value={`$${cc.wire.toLocaleString()}`} color="#334155"/>
        <SR label="Disconnects / Misc"   value={`$${cc.misc.toLocaleString()}`} color="#334155"/>
        <div style={{borderTop:'1px solid #e2e8f0',marginTop:6,paddingTop:6,
                     display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:8.5,color:'#7c3aed',fontWeight:'bold'}}>TOTAL ROM</span>
          <span style={{fontSize:14,color:'#7c3aed',fontWeight:'bold'}}>${cc.total.toLocaleString()}</span>
        </div>
        <div style={{fontSize:7,color:'#94a3b8',marginTop:4}}>
          *Excludes labor, permitting, well pump, trenching, mounting hardware
        </div>
      </Sec>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════════════════════ */
const MODES = [
  {k:'day_pump',   label:'☀ Day + Pumping',  tip:'Solar generating, pump running at FLC'},
  {k:'night_pump', label:'🌙 Night + Pump',   tip:'Battery discharging, pump running'},
  {k:'day_idle',   label:'☀ Day + Idle',     tip:'Solar charging batteries, no pump load'},
  {k:'night_idle', label:'🌙 Night Idle',     tip:'All systems standby'},
];

export default function App() {
  const [inp, setInp] = useState({hp:2, volts:240, phase:1, hrs:6, sun:5.5, days:2, sv:48});
  const [mode, setMode] = useState('day_pump');
  const [panelId, setPanelId] = useState('jinko_400');
  const [customPanel, setCustomPanel] = useState({Pmax:400, Voc:48.6, Vmp:40.5, Isc:9.87, Imp:9.38});
  const [batteryId, setBatteryId] = useState('pylontech');
  const [customBattery, setCustomBattery] = useState({kWh:5.12, dod:0.80, chem:'lfp'});
  const [scenario, setScenario] = useState('normal');

  const upd = (k, v) => setInp(p => ({...p, [k]:v}));

  const activePanel   = panelId   === 'custom' ? customPanel   : PANELS.find(p => p.id === panelId);
  const activeBattery = batteryId === 'custom' ? customBattery : BATTERIES.find(b => b.id === batteryId);

  const calc = useMemo(() => calcSys({...inp,
    panel:   activePanel   || PANELS[0],
    battery: activeBattery || BATTERIES[0],
  }), [inp, activePanel, activeBattery]);

  const disp = useMemo(() => {
    const {pvU, dcU, bU, acU, mU} = calc;
    const gridDown = scenario === 'grid_failure';
    switch(mode) {
      case 'day_pump':   return {pvU, dcU, bU: bU*(gridDown?0.55:0.30), acU, mU, gridDown};
      case 'night_pump': return {pvU:0, dcU:0, bU: bU*(gridDown?1.0:0.85), acU, mU, gridDown};
      case 'day_idle':   return {pvU:pvU*0.72, dcU:dcU*0.72, bU:bU*(gridDown?0.20:0.14), acU:0, mU:0, gridDown};
      case 'night_idle': return {pvU:0, dcU:0, bU:bU*(gridDown?0.08:0), acU:0, mU:0, gridDown};
      default:           return {pvU, dcU, bU, acU, mU, gridDown};
    }
  }, [calc, mode, scenario]);

  const panelName   = panelId   === 'custom' ? 'Custom Panel'   : (activePanel?.name   || '');
  const batteryName = batteryId === 'custom' ? 'Custom Battery' : (activeBattery?.name || '');

  const btnStyle = k => ({
    background:   mode===k ? '#1e3a5f' : '#ffffff',
    border:       `1px solid ${mode===k ? '#3b82f6' : '#d1d5db'}`,
    color:        mode===k ? '#93c5fd' : '#64748b',
    padding:      '4px 11px',
    borderRadius: 4,
    cursor:       'pointer',
    fontSize:     8.5,
    fontFamily:   'inherit',
    letterSpacing: 0.5,
    transition:   'all 0.15s',
    fontWeight:   mode===k ? 'bold' : 'normal',
  });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f0f4f8; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        input[type=range] { height: 3px; }
        select { outline: none; }
        select:focus { border-color: #3b82f6 !important; }
      `}</style>

      <div style={{background:'#f0f4f8', color:'#1e293b', height:'100vh', display:'flex',
                   flexDirection:'column', fontFamily:"'Space Mono','Courier New',monospace", overflow:'hidden'}}>

        {/* Header */}
        <div style={{background:'#1e3a5f', borderBottom:'2px solid #1e40af', padding:'8px 16px',
                     display:'flex', alignItems:'center', gap:14, flexShrink:0,
                     boxShadow:'0 2px 8px rgba(0,0,0,0.18)'}}>
          <div>
            <div style={{fontSize:13, color:'#ffffff', fontWeight:'bold', letterSpacing:3}}>
              &#9889; MICROGRID DESIGNER
            </div>
            <div style={{fontSize:7.5, color:'#93c5fd', letterSpacing:2, marginTop:1}}>
              SOLAR \xb7 BATTERY \xb7 INVERTER \xb7 WELL PUMP — NEC 690 / 480 / 430 COMPLIANT SIZING
            </div>
          </div>

          {/* Summary badges */}
          {[
            {l:'PV',   v:`${calc.pvKW.toFixed(1)} kW`,  c:'#fbbf24'},
            {l:'BATT', v:`${calc.bKwh.toFixed(1)} kWh`, c:'#4ade80'},
            {l:'INV',  v:`${calc.invKW} kW`,             c:'#60a5fa'},
            {l:'FLC',  v:`${calc.flc.toFixed(1)} A`,     c:'#fb923c'},
          ].map(({l,v,c})=>(
            <div key={l} style={{background:'rgba(255,255,255,0.08)', border:`1px solid ${c}50`,
                                 borderRadius:4, padding:'3px 10px', textAlign:'center'}}>
              <div style={{fontSize:6.5, color:c, letterSpacing:2}}>{l}</div>
              <div style={{fontSize:11, color:c, fontWeight:'bold'}}>{v}</div>
            </div>
          ))}

          {/* Scenario toggle */}
          <button
            onClick={() => setScenario(s => s==='normal' ? 'grid_failure' : 'normal')}
            style={{
              background: scenario==='grid_failure' ? '#7f1d1d' : '#064e3b',
              border: `2px solid ${scenario==='grid_failure' ? '#dc2626' : '#16a34a'}`,
              color: scenario==='grid_failure' ? '#fca5a5' : '#6ee7b7',
              padding: '5px 14px',
              borderRadius: 5,
              cursor: 'pointer',
              fontSize: 9,
              fontFamily: 'inherit',
              letterSpacing: 1,
              fontWeight: 'bold',
              transition: 'all 0.2s',
              minWidth: 130,
            }}
          >
            {scenario==='grid_failure' ? '&#9889; GRID FAILURE' : '✓ GRID CONNECTED'}
          </button>

          <div style={{flex:1}}/>

          {/* Mode selector */}
          <div style={{display:'flex', alignItems:'center', gap:5}}>
            <span style={{fontSize:7.5, color:'#64748b', marginRight:4}}>SIM MODE:</span>
            {MODES.map(m => (
              <button key={m.k} title={m.tip} onClick={()=>setMode(m.k)} style={btnStyle(m.k)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main 3-col layout */}
        <div style={{flex:1, display:'grid', gridTemplateColumns:'240px 1fr 296px', overflow:'hidden'}}>

          {/* Left: Inputs */}
          <div style={{background:'#ffffff', borderRight:'1px solid #e2e8f0', overflowY:'auto',
                       boxShadow:'2px 0 4px rgba(0,0,0,0.04)'}}>
            <InputPanel
              inp={inp} upd={upd}
              panelId={panelId} setPanelId={setPanelId}
              customPanel={customPanel} setCustomPanel={setCustomPanel}
              batteryId={batteryId} setBatteryId={setBatteryId}
              customBattery={customBattery} setCustomBattery={setCustomBattery}
              activePanel={activePanel} activeBattery={activeBattery}
            />
          </div>

          {/* Center: Diagram */}
          <div style={{overflowY:'auto', display:'flex', flexDirection:'column',
                       alignItems:'center', padding:'14px 8px', gap:6, background:'#f0f4f8'}}>
            <OneDiagram calc={calc} disp={disp} inp={inp}/>
            <div style={{fontSize:7.5, color:'#94a3b8', textAlign:'center', paddingBottom:8}}>
              All wire sizes: copper THWN-2 at 75\xb0C in conduit \xb7 Minimum design values \xb7 Verify with licensed electrician / AHJ
            </div>
          </div>

          {/* Right: Specs */}
          <div style={{background:'#f8fafc', borderLeft:'1px solid #e2e8f0', overflowY:'auto',
                       boxShadow:'-2px 0 4px rgba(0,0,0,0.04)'}}>
            <SpecsPanel calc={calc} inp={inp} panelName={panelName} batteryName={batteryName}/>
          </div>

        </div>
      </div>
    </>
  );
}
