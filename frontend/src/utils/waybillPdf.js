import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

/**
 * Generates and triggers download of an institutional Campus Freight Waybill / Proof-of-Delivery Receipt.
 * @param {Object} order - Full order object with trackingId, status, cargoDetails, pickupNode, dropoffNode, statusHistory, pod
 */
export async function generateWaybillPdf(order) {
  if (!order) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // 1. Header Bar (Dark Slate / Royal Blue)
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('CAMPUS FREIGHT & LOGISTICS SYSTEM', margin, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('OFFICIAL INTERNAL CAMPUS WAYBILL & PROOF-OF-DELIVERY RECEIPT', margin, 18);
  doc.text(`ISSUED: ${new Date().toLocaleString()}`, margin, 23);

  // Status Badge in Header
  const statusLabel = order.status ? order.status.replace(/_/g, ' ') : 'PENDING';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  if (order.status === 'DELIVERED') {
    doc.setFillColor(16, 185, 129); // emerald-500
  } else if (order.status === 'CANCELLED') {
    doc.setFillColor(239, 68, 68); // red-500
  } else {
    doc.setFillColor(59, 130, 246); // blue-500
  }
  doc.roundedRect(pageWidth - margin - 42, 8, 42, 12, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(statusLabel, pageWidth - margin - 21, 15.5, { align: 'center' });

  let y = 36;

  // 2. Tracking ID & Scannable QR Code
  // Generate QR Code data URL
  const qrPayload = JSON.stringify({
    trackingId: order.trackingId,
    status: order.status,
    pickup: order.pickupNode?.hubId,
    dropoff: order.dropoffNode?.hubId,
    weight: `${order.cargoDetails?.weightKg || 0}kg`,
    otpVerified: Boolean(order.pod?.isVerified)
  });

  try {
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      margin: 1,
      width: 120,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
    doc.addImage(qrDataUrl, 'PNG', pageWidth - margin - 32, y - 4, 32, 32);
  } catch (err) {
    console.error('Failed to generate QR code for waybill:', err);
  }

  // Tracking Meta block
  doc.setTextColor(30, 41, 59); // slate-800
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`Tracking ID: ${order.trackingId}`, margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(`Order Date: ${new Date(order.createdAt).toLocaleDateString()} | Priority: ${order.priority || 'STANDARD'}`, margin, y + 6);
  if (order.externalTrackingId) {
    doc.text(`External Carrier Ref: ${order.externalTrackingId}`, margin, y + 11);
  }

  y += 24;

  // 3. Routing Block (From -> To)
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(margin, y, contentWidth, 38, 3, 3, 'FD');

  const colWidth = (contentWidth - 6) / 2;

  // Pickup Column
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(37, 99, 235); // blue-600
  doc.text('▲ PICKUP LOCATION', margin + 4, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`${order.pickupNode?.buildingName || order.pickupNode?.hubId}`, margin + 4, y + 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Hub Code: ${order.pickupNode?.hubId}`, margin + 4, y + 18);
  doc.text(`Room: ${order.pickupNode?.roomNumber || 'N/A'}`, margin + 4, y + 23);
  doc.text(`Contact: ${order.pickupNode?.contactPhone || 'N/A'}`, margin + 4, y + 28);
  doc.text(`Requester: ${order.requesterId?.name || 'Authorized Staff'}`, margin + 4, y + 33);

  // Dropoff Column
  const rightColX = margin + colWidth + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(16, 185, 129); // emerald-600
  doc.text('▼ DROPOFF DESTINATION', rightColX, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`${order.dropoffNode?.buildingName || order.dropoffNode?.hubId}`, rightColX, y + 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Hub Code: ${order.dropoffNode?.hubId}`, rightColX, y + 18);
  doc.text(`Room: ${order.dropoffNode?.roomNumber || 'N/A'}`, rightColX, y + 23);
  doc.text(`Recipient: ${order.dropoffNode?.recipientName || 'Campus Staff'}`, rightColX, y + 28);
  doc.text(`Recipient Phone: ${order.dropoffNode?.recipientPhone || 'N/A'}`, rightColX, y + 33);

  y += 44;

  // 4. Cargo Details & Vehicle Assignment Table
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 32, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('CARGO SPECIFICATIONS & FLEET ASSIGNMENT', margin + 4, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Item Category: ${order.cargoDetails?.itemCategory?.replace(/_/g, ' ') || 'N/A'}`, margin + 4, y + 14);
  doc.text(`Gross Weight: ${order.cargoDetails?.weightKg || 0} kg`, margin + 4, y + 20);
  doc.text(`Fragile Cargo: ${order.cargoDetails?.isFragile ? 'YES (Handle with Care)' : 'NO'}`, margin + 4, y + 26);

  // Assignment details
  doc.text(`Assigned Driver: ${order.assignment?.driverId?.name || 'Mailroom Pool'}`, rightColX, y + 14);
  doc.text(`Vehicle: ${order.assignment?.vehicleId?.name || 'Pending'} (${order.assignment?.vehicleId?.type || 'N/A'})`, rightColX, y + 20);
  doc.text(`Registration: ${order.assignment?.vehicleId?.registrationNumber || 'N/A'}`, rightColX, y + 26);

  y += 38;

  // 5. Proof of Delivery / OTP Verification Stamp
  if (order.status === 'DELIVERED') {
    doc.setFillColor(236, 253, 245); // emerald-50
    doc.setDrawColor(16, 185, 129); // emerald-500
    doc.setLineWidth(0.8);
    doc.roundedRect(margin, y, contentWidth, 24, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(5, 150, 105); // emerald-600
    doc.text('✓ PROOF-OF-DELIVERY VERIFIED BY RECIPIENT OTP', margin + 6, y + 9);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(4, 120, 87);
    doc.text(`OTP Code: **** (Verified at ${order.pod?.verifiedAt ? new Date(order.pod.verifiedAt).toLocaleString() : 'Delivery'})`, margin + 6, y + 16);
    if (order.pod?.deliveryNotes) {
      doc.text(`Delivery Note: "${order.pod.deliveryNotes}"`, margin + 6, y + 21);
    }
  } else {
    doc.setFillColor(254, 243, 199); // amber-100
    doc.setDrawColor(245, 158, 11); // amber-500
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, y, contentWidth, 22, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(180, 83, 9); // amber-700
    doc.text('⚠ SECURE HANDOVER OTP REQUIRED AT DESTINATION', margin + 6, y + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(146, 64, 14);
    doc.text(`Recipient must verify this delivery with the 4-digit code provided on their portal.`, margin + 6, y + 14);
    if (order.pod?.otp) {
      doc.text(`Recipient PoD OTP: ${order.pod.otp}`, margin + 6, y + 19);
    }
  }

  y += 30;

  // 6. Chain of Custody / Status History Timeline
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('CHAIN OF CUSTODY AUDIT TRAIL', margin, y);
  y += 5;

  const history = order.statusHistory || [];
  if (history.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text('No historical transition records found.', margin, y + 5);
    y += 10;
  } else {
    history.forEach((step, index) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      const stepDate = step.timestamp ? new Date(step.timestamp).toLocaleString() : 'N/A';
      doc.text(`[${index + 1}] ${stepDate} — ${step.status}`, margin + 2, y + 4);

      if (step.note) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(`     Note: ${step.note}`, margin + 2, y + 8);
        y += 10;
      } else {
        y += 7;
      }
    });
  }

  // 7. Footer
  const footerY = 288;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Campus Logistics & Freight Autonomous Dispatch System — Official University Document', margin, footerY);
  doc.text(`Page 1 of ${doc.internal.getNumberOfPages()}`, pageWidth - margin, footerY, { align: 'right' });

  // Save PDF
  doc.save(`Waybill-${order.trackingId}.pdf`);
}

export default generateWaybillPdf;
