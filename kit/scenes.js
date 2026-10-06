/* =====================================================================
 * SandboxDrawingKit · scenes（场景组合绘制）
 * K.drawScene(ctx, scene, view, opts)
 *   opts:{ timeOfDay:'day'|'night', phase, facing, theme,
 *          occupants:[{slot, entity:{archetype,...}, facing}] }
 * 场景模板只提供 backdrop/fixtures/slots/connections；世界事实由宿主决定。
 * ===================================================================== */
(function (global) {
"use strict";
var K = global.SandboxDrawingKit;

K.drawScene = function (ctx, scene, view, opts) {
  if (!ctx || !scene || !view) throw new Error("drawScene requires ctx, scene, view");
  opts = opts || {};
  var tod = opts.timeOfDay || "day";
  var variant = (scene.variants && scene.variants[tod]) || scene.backdrop;
  K.drawBackdrop(ctx, { sky:variant.sky, objects:variant.objects }, view);

  var W = view.width, H = view.height;
  function box(b) {
    return { x:view.x + b.x/100*W, y:view.y + b.y/100*H,
      width:b.w/100*W, height:b.h/100*H };
  }
  var outFixtures = {}, outSlots = {};

  scene.fixtures.forEach(function (f) {
    var b = box(f);
    var r = K.drawEntity(ctx,
      { archetype:f.archetype, appearance:{}, visualState:{} },
      { x:b.x, y:b.y, width:b.width, height:b.height,
        phase:opts.phase||0, theme:opts.theme });
    if (tod==="night" && scene.fireFixtures &&
        scene.fireFixtures.indexOf(f.archetype)!==-1 && K.glowDot) {
      ctx.save();
      K.glowDot(ctx, { x:b.x+b.width/2, y:b.y+b.height*0.42 },
        Math.min(b.width,b.height)*0.55, "#ff9a4a", 0.55);
      ctx.restore();
    }
    outFixtures[f.archetype] = r.bounds;
  });

  (opts.occupants||[]).forEach(function (oc) {
    var slotDef = null;
    scene.slots.forEach(function (s){ if (s.id===oc.slot) slotDef = s; });
    if (!slotDef) return;
    var b = box(slotDef);
    var entity = oc.entity || { archetype:oc.archetype };
    var r = K.drawEntity(ctx, entity,
      { x:b.x, y:b.y, width:b.width, height:b.height, phase:opts.phase||0,
        facing:oc.facing||opts.facing, theme:opts.theme });
    outSlots[oc.slot] = r.bounds;
  });

  return { supported:true,
    bounds:{ x:view.x, y:view.y, width:W, height:H },
    fixtures:outFixtures, slots:outSlots, anchors:{} };
};
})(typeof window !== "undefined" ? window : globalThis);
