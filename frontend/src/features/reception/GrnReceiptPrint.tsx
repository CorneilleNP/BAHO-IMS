import type { ReactNode } from 'react';
import { Button, Group, Modal, Stack } from '@mantine/core';
import { IconPrinter } from '@tabler/icons-react';
import { num } from '../../lib/format';
import type { CherryReceipt } from '../../lib/types';

/** 1234567.5 -> "1,234,568" (the voucher states the currency once, in the FRW box). */
const money = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });
const kgs = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
/** "2026-11-26" -> "26/11/2026", as written on the paper vouchers. */
const paperDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

/** "Ngororero CWS" -> "NGORORERO" (the booklet prints the station name only). */
const stationName = (name: string) => name.replace(/\s+(cws|c\.w\.?s\.?|washing station)$/i, '').toUpperCase();

/** A printed label followed by a dotted line the value sits on (like the booklet). */
function Field({ label, value, grow = 1, after }: { label: string; value?: ReactNode; grow?: number; after?: string }) {
  return (
    <span className="grn-f" style={{ flexGrow: grow }}>
      <span className="grn-l">{label}</span>
      <span className="grn-d">{value}</span>
      {after && <span className="grn-l">{after}</span>}
    </span>
  );
}

/**
 * The paper "Goods Received Note / Payment Voucher" handed to the farmer at
 * weighing: a copy of the station booklet page (logo, wording, order of the
 * lines, dotted fill-in lines, the red voucher number), filled in from the GRN.
 */
export function GrnReceiptPrint({ receipt, onClose }: { receipt: CherryReceipt; onClose: () => void }) {
  const good = receipt.lines.find((l) => l.cherry_grade === 'GOOD');
  const float = receipt.lines.find((l) => l.cherry_grade === 'FLOAT');
  const totalTransport = receipt.lines.reduce((sum, l) => sum + num(l.transport_cost), 0);
  const totalKg = num(receipt.total_kg);
  const transportPerKg = totalTransport > 0 && totalKg > 0 ? totalTransport / totalKg : 0;
  const loc = receipt.farmer_location;

  return (
    <Modal opened onClose={onClose} title="GRN / payment voucher" size={760}>
      <Stack gap="md">
        <div className="grn-scroll">
          <div id="grn-voucher">
            <div className="grn-paper">
              <div className="grn-head">
                <img src="/baho-image.jpg" alt="Baho coffee company" className="grn-logo" />
                <div className="grn-head-text">
                  <div className="grn-company">BAHO COFFEE COMPANY LTD</div>
                  <div className="grn-station-row">
                    <span className="grn-station">C.W STATION: {stationName(receipt.facility_name)}</span>
                    <span className="grn-no">
                      <Field label="No:" value={<span className="grn-number">{receipt.grn_number}</span>} />
                    </span>
                  </div>
                </div>
              </div>

              <div className="grn-row grn-title-row">
                <span className="grn-title">GOODS RECEIVED NOTE/PAYMENT VOUCHER</span>
                <span className="grn-date"><Field label="Date" value={paperDate(receipt.received_on)} /></span>
              </div>

              <div className="grn-row"><Field label="Farmer's name:" value={receipt.farmer_name} /></div>
              <div className="grn-row">
                <Field label="ID No" value={receipt.farmer_national_id} grow={1.6} />
                <Field label="TEL" value={receipt.farmer_phone} />
              </div>
              <div className="grn-row">
                <Field label="Sector" value={loc.sector?.name} />
                <Field label="Cell" value={loc.cell?.name} />
                <Field label="Village" value={loc.village?.name} />
              </div>
              <div className="grn-row">
                <Field label="Good Cherry" value={good ? kgs(num(good.quantity_kg)) : ''} after="Kgs" />
                <Field label="Price / Kg:" value={good ? money(num(good.price_per_kg)) : ''} />
                <Field label="Amount:" value={good ? money(num(good.line_amount)) : ''} />
              </div>
              <div className="grn-row">
                <Field label="Float Cherry" value={float ? kgs(num(float.quantity_kg)) : ''} after="Kgs" />
                <Field label="Price / Kg:" value={float ? money(num(float.price_per_kg)) : ''} />
                <Field label="Amount:" value={float ? money(num(float.line_amount)) : ''} />
              </div>
              <div className="grn-row">
                <Field label="Cherry Transport / KG" value={transportPerKg ? kgs(transportPerKg) : ''} />
                <Field label="Total Transport:" value={totalTransport ? money(totalTransport) : ''} grow={1.3} />
              </div>

              <div className="grn-total-row">
                <span className="grn-total-label">TOTAL AMOUNT</span>
                <span className="grn-total-box"><Field label="FRW:" value={money(num(receipt.total_amount))} /></span>
              </div>

              <div className="grn-row grn-sign-row">
                <Field label="Farmer's Signature:" />
                <Field label="Weighing Clerk" value={receipt.created_by_name} />
              </div>
              <div className="grn-row grn-sign-row">
                <Field label="Checked by:" />
                <Field label="Paid by" />
              </div>
            </div>
          </div>
        </div>
        <Group justify="flex-end" className="grn-no-print">
          <Button variant="default" onClick={onClose}>Close</Button>
          <Button leftSection={<IconPrinter size={16} />} onClick={() => window.print()}>Print</Button>
        </Group>
      </Stack>

      <style>{`
        .grn-scroll { overflow-x: auto; }
        .grn-paper {
          min-width: 620px; background: #cdcec7; /* warm gray, like the booklet paper */ color: #111; border: 2px solid #111; padding: 14px 18px 18px;
          font-family: "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif; font-stretch: condensed;
          font-size: 15px; line-height: 1.2;
        }
        .grn-head { display: flex; align-items: flex-start; gap: 14px; }
        .grn-logo { width: 118px; height: auto; flex: none; margin-top: -4px; mix-blend-mode: multiply; /* white logo background takes the paper colour */ }
        .grn-head-text { flex: 1; min-width: 0; }
        .grn-company { font-size: 33px; font-weight: 800; letter-spacing: 0.2px; text-align: center; white-space: nowrap; }
        .grn-station-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-top: 6px; }
        .grn-station { font-size: 17px; white-space: nowrap; padding-bottom: 2px; }
        .grn-no { width: 250px; flex: none; display: flex; }
        .grn-no .grn-d { overflow: visible; text-align: right; }
        .grn-number {
          color: #d1262b; font-size: 21px; font-weight: 700; line-height: 1;
          font-family: "Courier New", Courier, monospace; white-space: nowrap;
        }
        .grn-row { display: flex; align-items: flex-end; gap: 18px; margin-top: 16px; }
        .grn-title-row { margin-top: 24px; justify-content: space-between; }
        .grn-title { font-size: 17px; font-weight: 800; white-space: nowrap; }
        .grn-date { width: 200px; display: flex; }
        .grn-f { display: flex; align-items: flex-end; min-width: 0; flex-basis: 0; }
        .grn-l { white-space: nowrap; flex: none; }
        .grn-d {
          flex: 1; min-width: 28px; border-bottom: 1.5px dotted #111; margin: 0 3px; padding: 0 4px 1px;
          font-family: Arial, Helvetica, sans-serif; font-weight: 700; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .grn-total-row { display: flex; align-items: center; gap: 48px; margin: 20px 0 6px 108px; }
        .grn-total-label { font-size: 18px; white-space: nowrap; }
        .grn-total-box { display: flex; width: 290px; border: 2px solid #111; padding: 8px 10px 10px; font-size: 17px; }
        .grn-total-box .grn-d { font-size: 16px; }
        .grn-sign-row { margin-top: 22px; gap: 28px; }

        @media print {
          @page { margin: 12mm; }
          html, body { background: #fff !important; }
          body * { visibility: hidden; }
          #grn-voucher, #grn-voucher * { visibility: visible; }
          /* Mantine's modal applies a CSS transform for its open/close animation,
             which makes position:fixed below resolve against that transformed box
             instead of the real page - that's what was clipping/displacing the
             voucher. Drop the transform (and any clipping) without taking the
             voucher's ancestors out of their own fixed/overlay positioning. */
          .mantine-Modal-content, .mantine-Modal-body, .mantine-Paper-root, .grn-scroll {
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            transform: none !important;
            box-shadow: none !important;
          }
          #grn-voucher { position: fixed; top: 0; left: 0; width: 100%; max-width: 190mm; }
          .grn-paper { min-width: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .grn-no-print { display: none; }
        }
      `}</style>
    </Modal>
  );
}
