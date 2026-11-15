/* 雨骨 · 伞面生成器（经典脚本，file:// 直接可用）
 *
 * 唯一的数据入口是 data/rain-2024.js（由 data/rain-2024.json 生成）。
 * 三条硬规则，和版面上的文字必须一一对得上：
 *   1) 一天一圈，从伞心到伞边按时间顺序；每圈等面积（r = R·√(i/n)），即"每天占同样大的一块绸"。
 *   2) 一滴墨 = 一毫米雨：第 i 天画 round(mm_i) 滴。
 *   3) 那一圈的墨色浓淡，同样由 mm_i 决定（不是装饰）。
 */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const INK = "#1b1e1a";
  const RIM = "#8d7c5f";

  const el = (name, attrs = {}, parent) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== null && v !== undefined) n.setAttribute(k, String(v));
    }
    if (parent) parent.appendChild(n);
    return n;
  };

  // 确定性随机：同一天永远得到同一组角度，重跑像素不变
  function hashSeed(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rings(daily, R) {
    const n = daily.length;
    return daily.map((d, i) => {
      const r0 = i === 0 ? 0 : R * Math.sqrt(i / n);
      const r1 = R * Math.sqrt((i + 1) / n);
      return { i, date: d.date, mm: d.mm, r0, r1, drops: Math.round(d.mm) };
    });
  }

  function stats(daily) {
    const mm = daily.map((d) => d.mm);
    const total = mm.reduce((a, b) => a + b, 0);
    const max = Math.max(...mm);
    const maxIdx = mm.indexOf(max);
    return {
      n: daily.length,
      total: Math.round(total * 10) / 10,
      max,
      maxDate: daily[maxIdx].date,
      dry: daily.filter((d) => d.mm === 0).length,
      drops: daily.reduce((a, d) => a + Math.round(d.mm), 0),
      wetDays: daily.filter((d) => d.mm >= 0.1).length,
    };
  }

  function defs(svg, id) {
    const d = el("defs", {}, svg);

    const silk = el("radialGradient", { id: `${id}-silk`, cx: "40%", cy: "34%", r: "76%" }, d);
    el("stop", { offset: "0%", "stop-color": "#FCF7EC" }, silk);
    el("stop", { offset: "55%", "stop-color": "#F5EEDC" }, silk);
    el("stop", { offset: "100%", "stop-color": "#E5D9BE" }, silk);

    const ink = el("radialGradient", { id: `${id}-ink`, cx: "50%", cy: "50%", r: "50%" }, d);
    el("stop", { offset: "0%", "stop-color": "#141714" }, ink);
    el("stop", { offset: "100%", "stop-color": "#262c21" }, ink);

    const bam = el("linearGradient", { id: `${id}-bamboo`, x1: "0", y1: "0", x2: "1", y2: "0" }, d);
    el("stop", { offset: "0%", "stop-color": "#7C6A45" }, bam);
    el("stop", { offset: "26%", "stop-color": "#C4AD7B" }, bam);
    el("stop", { offset: "52%", "stop-color": "#DCC99B" }, bam);
    el("stop", { offset: "78%", "stop-color": "#B39C6C" }, bam);
    el("stop", { offset: "100%", "stop-color": "#6F5F3E" }, bam);

    const red = el("linearGradient", { id: `${id}-cinnabar`, x1: "0", y1: "0", x2: "0", y2: "1" }, d);
    el("stop", { offset: "0%", "stop-color": "#B23A2C" }, red);
    el("stop", { offset: "55%", "stop-color": "#8E2A20" }, red);
    el("stop", { offset: "100%", "stop-color": "#5E1A14" }, red);

    // 墨在绸上会洇：一层很轻的位移，让每圈边界不是几何圆
    const bleed = el("filter", { id: `${id}-bleed`, x: "-12%", y: "-12%", width: "124%", height: "124%" }, d);
    el("feTurbulence", { type: "fractalNoise", baseFrequency: "0.004 0.007", numOctaves: "3", seed: "7", result: "t" }, bleed);
    el("feDisplacementMap", { in: "SourceGraphic", in2: "t", scale: "40", xChannelSelector: "R", yChannelSelector: "G" }, bleed);

    const drop = el("filter", { id: `${id}-drop`, x: "-60%", y: "-60%", width: "220%", height: "220%" }, d);
    el("feTurbulence", { type: "fractalNoise", baseFrequency: "0.05", numOctaves: "2", seed: "3", result: "t2" }, drop);
    el("feDisplacementMap", { in: "SourceGraphic", in2: "t2", scale: "6", xChannelSelector: "R", yChannelSelector: "G" }, drop);

    const soft = el("filter", { id: `${id}-soft`, x: "-40%", y: "-40%", width: "180%", height: "180%" }, d);
    el("feGaussianBlur", { stdDeviation: "10" }, soft);

    return d;
  }

  /* 荷叶边：32 个骨尖之间，绸往里收一点——伞的轮廓靠这一圈认出来 */
  function canopyPath(cx, cy, R, sag, n = 32) {
    const pt = (th, r) => [cx + Math.cos(th) * r, cy + Math.sin(th) * r];
    let d = "";
    for (let b = 0; b < n; b++) {
      const t0 = (b / n) * Math.PI * 2 - Math.PI / 2;
      const t1 = ((b + 1) / n) * Math.PI * 2 - Math.PI / 2;
      const tm = (t0 + t1) / 2;
      const a = pt(t0, R), m = pt(tm, R - sag), e = pt(t1, R);
      if (b === 0) d += `M ${a[0].toFixed(1)} ${a[1].toFixed(1)} `;
      d += `Q ${m[0].toFixed(1)} ${m[1].toFixed(1)} ${e[0].toFixed(1)} ${e[1].toFixed(1)} `;
    }
    return d + "Z";
  }

  function donut(cx, cy, r0, r1) {
    return (
      `M ${cx - r1} ${cy} a ${r1} ${r1} 0 1 0 ${r1 * 2} 0 a ${r1} ${r1} 0 1 0 ${-r1 * 2} 0 z ` +
      `M ${cx - r0} ${cy} a ${r0} ${r0} 0 1 1 ${r0 * 2} 0 a ${r0} ${r0} 0 1 1 ${-r0 * 2} 0 z`
    );
  }

  /* 俯视：撑开的那一面 */
  function open(svg, opt) {
    const { cx, cy, R, daily } = opt;
    svg.setAttribute("viewBox", `0 0 ${opt.w} ${opt.h}`);
    const d = defs(svg, "o");
    const rs = rings(daily, R);
    const st = stats(daily);
    const max = st.max;
    const canopy = canopyPath(cx, cy, R, 17);

    const clip = el("clipPath", { id: "o-clip" }, d);
    el("path", { d: canopy }, clip);

    // 伞落在纸上的影子：没有它，怎么看都像贴在纸上的图
    el("path", { d: canopy, fill: "#2a2318", opacity: 0.16, filter: "url(#o-soft)", transform: "translate(26,34)" }, svg);

    const body = el("g", { "clip-path": "url(#o-clip)" }, svg);
    el("path", { d: canopy, fill: "url(#o-silk)" }, body);

    // 32 块扇面：绷的时候张力不一样，颜色也差一点
    for (let b = 0; b < 32; b++) {
      const t0 = (b / 32) * Math.PI * 2 - Math.PI / 2;
      const t1 = ((b + 1) / 32) * Math.PI * 2 - Math.PI / 2;
      el("path", {
        d: `M ${cx} ${cy} L ${(cx + Math.cos(t0) * R * 1.1).toFixed(1)} ${(cy + Math.sin(t0) * R * 1.1).toFixed(1)} L ${(cx + Math.cos(t1) * R * 1.1).toFixed(1)} ${(cy + Math.sin(t1) * R * 1.1).toFixed(1)} Z`,
        fill: b % 2 ? "#ffffff" : "#8a7449",
        opacity: b % 2 ? 0.055 : 0.012,
      }, body);
    }

    // 墨圈：25 圈，同一组过一个位移滤镜，边界才像洇出来的
    const g = el("g", { filter: "url(#o-bleed)" }, body);
    for (const k of rs) {
      const a = k.mm === 0 ? 0 : 0.03 + 0.38 * Math.pow(k.mm / max, 0.8);
      if (k.r0 === 0) {
        el("circle", { cx, cy, r: k.r1, fill: "url(#o-ink)", opacity: a }, g);
      } else {
        el("path", { d: donut(cx, cy, k.r0, k.r1), fill: "url(#o-ink)", opacity: a, "fill-rule": "evenodd" }, g);
      }
    }

    // 刷花：大雨的日子多几道断开的弧，像刷子从伞面上拖过去
    const brush = el("g", { filter: "url(#o-bleed)" }, body);
    for (const k of rs) {
      if (k.mm < 8) continue;
      const rnd = mulberry32(hashSeed(k.date + "b"));
      const strokes = 2 + Math.round(4 * (k.mm / max));
      for (let j = 0; j < strokes; j++) {
        const rr = k.r0 + (k.r1 - k.r0) * (0.2 + 0.6 * rnd());
        const a0 = rnd() * Math.PI * 2;
        const span = 0.5 + rnd() * 1.7;
        el("path", {
          d: `M ${(cx + Math.cos(a0) * rr).toFixed(1)} ${(cy + Math.sin(a0) * rr).toFixed(1)} A ${rr.toFixed(1)} ${rr.toFixed(1)} 0 0 1 ${(cx + Math.cos(a0 + span) * rr).toFixed(1)} ${(cy + Math.sin(a0 + span) * rr).toFixed(1)}`,
          fill: "none", stroke: "#171b17", "stroke-width": (5 + 12 * rnd()).toFixed(1),
          opacity: (0.05 + 0.1 * rnd()).toFixed(3), "stroke-linecap": "round",
        }, brush);
      }
    }

    // 雨滴：一滴一毫米
    const dg = el("g", { filter: "url(#o-drop)" }, body);
    for (const k of rs) {
      if (!k.drops) continue;
      const rnd = mulberry32(hashSeed(k.date));
      const rr = 10 + 8 * Math.pow(k.mm / max, 0.5);
      const base = rnd() * Math.PI * 2;
      for (let j = 0; j < k.drops; j++) {
        const th = base + (j / k.drops) * Math.PI * 2 + (rnd() - 0.5) * 0.22;
        const rad = Math.sqrt(k.r0 * k.r0 + (k.r1 * k.r1 - k.r0 * k.r0) * (0.18 + 0.64 * rnd()));
        const x = cx + Math.cos(th) * rad;
        const y = cy + Math.sin(th) * rad;
        el("circle", { cx: x, cy: y, r: rr * 1.9, fill: "#141813", opacity: 0.09, filter: "url(#o-soft)" }, dg);
        el("circle", { cx: x, cy: y, r: rr, fill: INK, opacity: 0.5 + 0.38 * rnd() }, dg);
      }
    }

    // 骨：竹骨从绸下面顶出来，一根骨一道亮一道影
    const ribs = el("g", {}, body);
    for (let b = 0; b < 32; b++) {
      const th = (b / 32) * Math.PI * 2 - Math.PI / 2;
      const nx = Math.cos(th + Math.PI / 2), ny = Math.sin(th + Math.PI / 2);
      const xa = cx + Math.cos(th) * 40, ya = cy + Math.sin(th) * 40;
      const xb = cx + Math.cos(th) * R, yb = cy + Math.sin(th) * R;
      el("line", {
        x1: xa + nx * 7, y1: ya + ny * 7, x2: xb + nx * 8, y2: yb + ny * 8,
        stroke: "#463c2a", "stroke-width": 20, opacity: 0.1, filter: "url(#o-soft)",
      }, ribs);
      el("line", {
        x1: xa - nx * 5, y1: ya - ny * 5, x2: xb - nx * 6, y2: yb - ny * 6,
        stroke: "#FFFBF0", "stroke-width": 12, opacity: 0.32,
      }, ribs);
      el("line", { x1: xa, y1: ya, x2: xb, y2: yb, stroke: "#6d6350", "stroke-width": 2.6, opacity: 0.4 }, ribs);
    }

    // 边：荷叶边缝线 + 卷边 + 外沿影子
    el("path", { d: canopy, fill: "none", stroke: RIM, "stroke-width": 13, opacity: 0.92 }, svg);
    el("path", { d: canopyPath(cx, cy, R - 27, 15), fill: "none", stroke: RIM, "stroke-width": 3, opacity: 0.5, "stroke-dasharray": "14 12" }, svg);
    el("path", { d: canopy, fill: "none", stroke: "#4a4132", "stroke-width": 3, opacity: 0.32, transform: "translate(7,8)" }, svg);

    // 伞顶（朱漆）：木顶包着朱漆
    el("circle", { cx, cy, r: 84, fill: "#BBA57B" }, svg);
    el("circle", { cx, cy, r: 84, fill: "none", stroke: "#5E4A2C", "stroke-width": 4, opacity: 0.55 }, svg);
    el("circle", { cx, cy, r: 63, fill: "url(#o-cinnabar)" }, svg);
    el("circle", { cx, cy, r: 31, fill: "#2c1a12", opacity: 0.78 }, svg);
    el("circle", { cx: cx - 22, cy: cy - 24, r: 15, fill: "#FFF3DC", opacity: 0.3 }, svg);
    el("path", { d: `M ${cx - 61} ${cy - 22} A 63 63 0 0 1 ${cx + 4} ${cy - 63}`, fill: "none", stroke: "#FFE6C8", "stroke-width": 8, opacity: 0.32 }, svg);

    return { rings: rs, stats: st };
  }

  /* 仰视：里面那一面（长骨、短撑、穿花线、上下斗） */
  function inside(svg, opt) {
    const { cx, cy, R } = opt;
    svg.setAttribute("viewBox", `0 0 ${opt.w} ${opt.h}`);
    defs(svg, "i");

    el("circle", { cx, cy, r: R, fill: "#F7F0DE" }, svg);
    el("circle", { cx, cy, r: R * 0.52, fill: "#FCF7EC", opacity: 0.92 }, svg);

    // 32 根长骨
    const bones = el("g", {}, svg);
    for (let b = 0; b < 32; b++) {
      const th = (b / 32) * Math.PI * 2 - Math.PI / 2;
      const x2 = cx + Math.cos(th) * R, y2 = cy + Math.sin(th) * R;
      const x1 = cx + Math.cos(th) * 96, y1 = cy + Math.sin(th) * 96;
      const nx = Math.cos(th + Math.PI / 2), ny = Math.sin(th + Math.PI / 2);
      const w0 = 7.5, w1 = 5.5;
      el("path", {
        d: `M ${(x1 + nx * w0).toFixed(1)} ${(y1 + ny * w0).toFixed(1)} L ${(x2 + nx * w1).toFixed(1)} ${(y2 + ny * w1).toFixed(1)} L ${(x2 - nx * w1).toFixed(1)} ${(y2 - ny * w1).toFixed(1)} L ${(x1 - nx * w0).toFixed(1)} ${(y1 - ny * w0).toFixed(1)} z`,
        fill: "url(#i-bamboo)", stroke: "#6E5C3A", "stroke-width": 1.2, "stroke-opacity": 0.5,
      }, bones);
      el("line", { x1: x1 - nx * 4, y1: y1 - ny * 4, x2: x2 - nx * 3, y2: y2 - ny * 3, stroke: "#3A2F1E", "stroke-width": 16, opacity: 0.1, filter: "url(#i-soft)" }, bones);
      el("line", { x1: x1 + nx * 3.2, y1: y1 + ny * 3.2, x2: x2 + nx * 2.4, y2: y2 + ny * 2.4, stroke: "#FFF8E0", "stroke-width": 2.6, opacity: 0.65 }, bones);
    }

    // 短撑：上斗到长骨中段（和长骨并着走，留一道缝给穿花线）
    const stays = el("g", {}, svg);
    for (let b = 0; b < 32; b++) {
      const th = (b / 32) * Math.PI * 2 - Math.PI / 2;
      const th2 = th + Math.PI / 32;
      const x1 = cx + Math.cos(th2) * 112, y1 = cy + Math.sin(th2) * 112;
      const x2 = cx + Math.cos(th) * R * 0.46, y2 = cy + Math.sin(th) * R * 0.46;
      el("line", { x1, y1, x2, y2, stroke: "#3F301B", "stroke-width": 7.5, "stroke-linecap": "round", opacity: 0.92 }, stays);
      el("line", { x1, y1, x2, y2, stroke: "#F2E4BE", "stroke-width": 2.4, opacity: 0.9 }, stays);
    }

    // 穿花线：长骨与短撑之间来回交叉的网
    const net = el("g", { opacity: "0.9" }, svg);
    const rows = 10;
    for (let row = 0; row < rows; row++) {
      const t0 = 0.08 + (row / rows) * 0.34;
      const t1 = 0.08 + ((row + 1) / rows) * 0.34;
      for (let b = 0; b < 32; b++) {
        const th0 = (b / 32) * Math.PI * 2 - Math.PI / 2;
        const th1 = ((b + 1) / 32) * Math.PI * 2 - Math.PI / 2;
        const r0 = 86 + (R * 0.46 - 86) * t0;
        const r1 = 86 + (R * 0.46 - 86) * t1;
        const ax = cx + Math.cos(th0) * r0, ay = cy + Math.sin(th0) * r0;
        const bx = cx + Math.cos(th1) * r1, by = cy + Math.sin(th1) * r1;
        const cxd = cx + Math.cos(th0) * r1, cyd = cy + Math.sin(th0) * r1;
        el("line", { x1: ax, y1: ay, x2: bx, y2: by, stroke: "#2E2A1F", "stroke-width": 2.4, opacity: 0.62 }, net);
        el("line", { x1: ax, y1: ay, x2: cxd, y2: cyd, stroke: "#2E2A1F", "stroke-width": 1.8, opacity: 0.4 }, net);
      }
    }

    // 上斗 / 下斗 / 伞柄
    el("circle", { cx, cy, r: 108, fill: "#B79F6E" }, svg);
    el("circle", { cx, cy, r: 108, fill: "none", stroke: "#5E4A2C", "stroke-width": 3, opacity: 0.55 }, svg);
    el("circle", { cx, cy, r: 100, fill: "#C0A874" }, svg);
    el("circle", { cx, cy, r: 100, fill: "none", stroke: "#6E5C3A", "stroke-width": 3, opacity: 0.7 }, svg);
    for (let b = 0; b < 32; b++) {
      const th = (b / 32) * Math.PI * 2;
      el("line", {
        x1: cx + Math.cos(th) * 62, y1: cy + Math.sin(th) * 62,
        x2: cx + Math.cos(th) * 99, y2: cy + Math.sin(th) * 99,
        stroke: "#8B7449", "stroke-width": 1.6, opacity: 0.45,
      }, svg);
    }
    el("circle", { cx, cy, r: 60, fill: "#8A7449" }, svg);
    el("circle", { cx, cy, r: 36, fill: "url(#i-cinnabar)" }, svg);
    el("circle", { cx, cy, r: 13, fill: "#2c1a12", opacity: 0.7 }, svg);

    el("circle", { cx, cy, r: R, fill: "none", stroke: RIM, "stroke-width": 5, opacity: 0.8 }, svg);
    return {};
  }

  /* 收拢：一支竹 */
  function closed(svg, opt) {
    const { y, w, h } = opt;
    const fat = opt.fat || 1;
    svg.setAttribute("viewBox", `0 0 ${w} ${h + 60}`);
    defs(svg, "c");
    const cx = w / 2;
    // 真实比例：收拢 55 厘米长、五六厘米粗；这里只把横向量加粗，长度不动
    const G = el("g", { transform: `translate(${cx} 0) scale(${fat} 1) translate(${-cx} 0)` }, svg);

    el("ellipse", { cx: cx + 28, cy: y + h * 0.5, rx: 36, ry: h * 0.46, fill: "#2b2318", opacity: 0.13, filter: "url(#c-soft)" }, G);

    const body = el("path", {
      d: `M ${cx - 31} ${y + 30} L ${cx + 31} ${y + 30} L ${cx + 35} ${y + h - 44} Q ${cx + 35} ${y + h - 6} ${cx} ${y + h - 6} Q ${cx - 35} ${y + h - 6} ${cx - 35} ${y + h - 44} Z`,
      fill: "url(#c-bamboo)", stroke: "#5E4F33", "stroke-width": 2, "stroke-opacity": 0.45,
    }, G);

    for (const t of [0.15, 0.32, 0.49, 0.65, 0.8]) {
      const yy = y + h * t;
      el("path", { d: `M ${cx - 33} ${yy} Q ${cx} ${yy + 10} ${cx + 33} ${yy}`, fill: "none", stroke: "#5b4c30", "stroke-width": 3.6, opacity: 0.55 }, G);
      el("path", { d: `M ${cx - 33} ${yy - 4} Q ${cx} ${yy + 6} ${cx + 33} ${yy - 4}`, fill: "none", stroke: "#F3E4BC", "stroke-width": 2.4, opacity: 0.55 }, G);
    }

    el("line", { x1: cx + 13, y1: y + 34, x2: cx + 14, y2: y + h - 48, stroke: "#5b4c30", "stroke-width": 1.7, opacity: 0.35 }, G);
    el("line", { x1: cx - 17, y1: y + 34, x2: cx - 18, y2: y + h - 48, stroke: "#5b4c30", "stroke-width": 1.3, opacity: 0.22 }, G);

    el("path", { d: `M ${cx - 35} ${y + 34} L ${cx - 27} ${y + 4} Q ${cx} ${y - 12} ${cx + 27} ${y + 4} L ${cx + 35} ${y + 34} Z`, fill: "url(#c-cinnabar)" }, G);
    el("ellipse", { cx, cy: y + 2, rx: 15, ry: 6, fill: "#F1D9A8", opacity: 0.85 }, G);
    el("rect", { x: cx - 37, y: y + 28, width: 74, height: 13, fill: "#6E5C3A", opacity: 0.85 }, G);

    el("path", { d: `M ${cx - 16} ${y + h - 8} L ${cx + 16} ${y + h - 8} L ${cx + 14} ${y + h + 38} L ${cx - 14} ${y + h + 38} Z`, fill: "#4a3a28" }, G);
    el("ellipse", { cx, cy: y + h + 38, rx: 14, ry: 6, fill: "#2e2318" }, G);
    return {};
  }

  window.YUGU = { open, inside, closed, rings, stats, hashSeed, canopyPath };
})();
