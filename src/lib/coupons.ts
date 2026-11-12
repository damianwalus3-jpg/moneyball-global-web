import { combinedProbability, totalOdds, validateBatch } from "./domain";
import { deleteRow, deleteWhere, insertRow, insertRows } from "./db";
import type { Prediction } from "./types";

export interface SaveBatchOptions {
  namePrefix: string;
  stake: number | null;
  recordStake: boolean;
  legsPerCoupon?: 1 | 3;
}

/** Validates and stores single or three-leg coupons with their legs. */
export async function saveCouponBatch(coupons: Prediction[][], opts: SaveBatchOptions) {
  const legsPerCoupon = opts.legsPerCoupon ?? 3;
  const errors = validateBatch(coupons, legsPerCoupon);
  if (errors.length) throw new Error(errors.join(" "));
  if (coupons.some((legs) => legs.length !== legsPerCoupon || new Set(legs.map((l) => l.match_id)).size !== legsPerCoupon)) {
    throw new Error(`Nie zapisano kuponu: każdy kupon musi zawierać ${legsPerCoupon} ${legsPerCoupon === 1 ? "zdarzenie" : "różne mecze"}.`);
  }
  const batchId = crypto.randomUUID();
  let created = 0;
  const createdCouponIds: string[] = [];
  for (const [i, legs] of coupons.entries()) {
    let couponId: string | null = null;
    try {
    const coupon = await insertRow("coupons", {
      name: `${opts.namePrefix} #${i + 1}`.trim(),
      batch_id: batchId,
      target_legs: legsPerCoupon,
      stake: opts.stake,
      total_odds: totalOdds(legs.map((l) => l.odds)),
      combined_probability: combinedProbability(legs.map((l) => l.probability)),
      status: "pending",
    });
    couponId = coupon.id;
    const insertedLegs = await insertRows(
      "coupon_legs",
      legs.map((l, index) => ({
        coupon_id: coupon.id,
        leg_number: index + 1,
        prediction_id: l.id,
        match_id: l.match_id,
        prediction_type: l.prediction_type,
        pick: l.pick,
        probability: l.probability,
        odds: l.odds,
        result_status: "pending",
      })),
    );
    if (insertedLegs.length !== legsPerCoupon) throw new Error(`Nie udało się zapisać kompletu ${legsPerCoupon} zdarzeń kuponu.`);
    if (opts.recordStake && opts.stake && opts.stake > 0) {
      await insertRow("bankroll_transactions", {
        occurred_at: new Date().toISOString(),
        type: "stake",
        amount: opts.stake,
        coupon_id: coupon.id,
        note: `Stawka: ${coupon.name ?? "kupon"}`,
      });
    }
    createdCouponIds.push(coupon.id);
    created++;
    } catch (error) {
      const rollbackIds = [...createdCouponIds, ...(couponId ? [couponId] : [])].reverse();
      for (const id of rollbackIds) {
        await deleteWhere("bankroll_transactions", "coupon_id", id).catch(() => undefined);
        await deleteWhere("coupon_legs", "coupon_id", id).catch(() => undefined);
        await deleteRow("coupons", id).catch(() => undefined);
      }
      throw error;
    }
  }
  return created;
}
