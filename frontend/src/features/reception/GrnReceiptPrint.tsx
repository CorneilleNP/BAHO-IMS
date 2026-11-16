import { Button, Group, Modal, Stack } from '@mantine/core';
import { IconPrinter } from '@tabler/icons-react';
import { num, rwf } from '../../lib/format';
import type { CherryReceipt } from '../../lib/types';

/**
 * The paper "Goods Received Note / Payment Voucher" handed to the farmer at
 * weighing, matching the station's own printed booklet (logo, layout, the red
 * voucher number) so the clerk can print one straight from the GRN.
 */
export function GrnReceiptPrint({ receipt, onClose }: { receipt: CherryReceipt; onClose: () => void }) {
  const good = receipt.lines.find((l) => l.cherry_grade === 'GOOD');
  const float = receipt.lines.find((l) => l.cherry_grade === 'FLOAT');
  const totalTransport = receipt.lines.reduce((sum, l) => sum + num(l.transport_cost), 0);
  const loc = receipt.farmer_location;

  return (
    <Modal opened onClose={onClose} title="GRN / payment voucher" size="lg">
      <Stack gap="md">
        <div id="grn-voucher">
          <table className="grn-box">
            <tbody>
              <tr>
                <td className="grn-header">
                  <div className="grn-header-row">
                    <img src="/baho-image.jpg" alt="" className="grn-logo" />
                    <div className="grn-title-block">
                      <div className="grn-company">BAHO COFFEE COMPANY LTD</div>
                      <div className="grn-row">
                        <span>C.W STATION: <strong>{receipt.facility_name.toUpperCase()}</strong></span>
                        <span>No.: <span className="grn-number">{receipt.grn_number}</span></span>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
              <tr>
                <td className="grn-field">
                  <div className="grn-row">
                    <span className="grn-subtitle">GOODS RECEIVED NOTE/PAYMENT VOUCHER</span>
                    <span>Date: <span className="grn-fill">{receipt.received_on}</span></span>
                  </div>
                </td>
              </tr>
              <tr><td className="grn-field">Farmer's name: <span className="grn-fill grn-fill-wide">{receipt.farmer_name}</span></td></tr>
              <tr>
                <td className="grn-field">
                  ID No. <span className="grn-fill">{receipt.farmer_national_id}</span>
                  &nbsp;&nbsp;Cell <span className="grn-fill">{loc.cell?.name ?? ''}</span>
                  &nbsp;&nbsp;TEL <span className="grn-fill">{receipt.farmer_phone}</span>
                </td>
              </tr>
              <tr>
                <td className="grn-field">
                  Sector <span className="grn-fill">{loc.sector?.name ?? ''}</span>
                  &nbsp;&nbsp;Village <span className="grn-fill grn-fill-wide">{loc.village?.name ?? ''}</span>
                </td>
              </tr>
              <tr>
                <td className="grn-field">
                  Good Cherry <span className="grn-fill">{good ? num(good.quantity_kg) : ''}</span> Kgs
                  &nbsp;&nbsp;Price / Kg <span className="grn-fill">{good ? rwf(good.price_per_kg) : ''}</span>
                  &nbsp;&nbsp;Amount <span className="grn-fill">{good ? rwf(good.line_amount) : ''}</span>
                </td>
              </tr>
              <tr>
                <td className="grn-field">
                  Float Cherry <span className="grn-fill">{float ? num(float.quantity_kg) : ''}</span> Kgs
                  &nbsp;&nbsp;Price / Kg <span className="grn-fill">{float ? rwf(float.price_per_kg) : ''}</span>
                  &nbsp;&nbsp;Amount <span className="grn-fill">{float ? rwf(float.line_amount) : ''}</span>
                </td>
              </tr>
              <tr>
                <td className="grn-field">
                  Cherry Transport / KG <span className="grn-fill" />
                  &nbsp;&nbsp;Total Transport <span className="grn-fill grn-fill-wide">{totalTransport > 0 ? rwf(totalTransport) : ''}</span>
                </td>
              </tr>
              <tr>
                <td className="grn-total-row">
                  <span>TOTAL AMOUNT</span>
                  <span className="grn-total-box">FRW: <strong>{rwf(receipt.total_amount)}</strong></span>
                </td>
              </tr>
              <tr>
                <td className="grn-field grn-signatures">
                  <span>Farmer's Signature <span className="grn-fill grn-sig" /></span>
                  <span>Weighing Clerk <span className="grn-fill">{receipt.created_by_name}</span></span>
                </td>
              </tr>
              <tr>
                <td className="grn-field grn-signatures">
                  <span>Checked by <span className="grn-fill grn-sig" /></span>
                  <span>Paid by <span className="grn-fill grn-sig" /></span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <Group justify="flex-end" className="grn-no-print">
          <Button variant="default" onClick={onClose}>Close</Button>
          <Button leftSection={<IconPrinter size={16} />} onClick={() => window.print()}>Print</Button>
        </Group>
      </Stack>

      <style>{`
        .grn-box { width: 100%; border: 2px solid #000; border-collapse: collapse; font-size: 13px; font-family: Arial, Helvetica, sans-serif; color: #000; background: #CCCCCC; }
        .grn-box td { padding: 5px 10px; border-bottom: 1px solid #000; }
        .grn-header { border-bottom: 2px solid #000 !important; }
        .grn-header-row { display: flex; align-items: center; gap: 10px; }
        .grn-logo { height: 52px; width: auto; flex-shrink: 0; object-fit: contain; }
        .grn-title-block { flex: 1; }
        .grn-company { font-size: 19px; font-weight: 800; letter-spacing: 0.3px; margin-bottom: 2px; }
        .grn-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 12.5px; gap: 10px; }
        .grn-subtitle { font-weight: 700; }
        .grn-number { color: #c00000; font-weight: 800; font-size: 15px; }
        .grn-field { }
        .grn-fill { display: inline-block; min-width: 70px; border-bottom: 1px dotted #000; padding: 0 4px; }
        .grn-fill-wide { min-width: 140px; }
        .grn-total-row { display: flex; justify-content: space-between; align-items: center; font-weight: 700; }
        .grn-total-box { border: 1px solid #000; padding: 4px 14px; }
        .grn-signatures { display: flex; justify-content: space-between; gap: 32px; }

        @media print {
          body * { visibility: hidden; }
          #grn-voucher, #grn-voucher * { visibility: visible; }
          /* Mantine's modal applies a CSS transform for its open/close animation,
             which makes position:fixed below resolve against that transformed box
             instead of the real page - that's what was clipping/displacing the
             voucher. Drop the transform (and any clipping) without taking the
             voucher's ancestors out of their own fixed/overlay positioning. */
          .mantine-Modal-content, .mantine-Modal-body, .mantine-Paper-root {
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            transform: none !important;
            box-shadow: none !important;
          }
          #grn-voucher { position: fixed; top: 0; left: 0; width: 100%; padding: 24px; }
          .grn-no-print { display: none; }
        }
      `}</style>
    </Modal>
  );
}
