import { QRCodeSVG } from 'qrcode.react';

export default function PatientLabel({ name, mrNumber, date, tests, referredBy }) {
  const qrDetails = [
    `Patient Name: ${name}`,
    `MR #: ${mrNumber || 'Pending'}`,
    `Date: ${date}`,
    `Tests: ${tests}`,
    `Ref By: ${referredBy}`
  ].join('\n');

  return (
    <div id="print-label">
      <div className="label-sticker">
        <div className="label-header">P D C</div>
        <div className="label-body">
          <div className="label-row label-name-row">
            <span className="label-key">Patient Name:</span>
            <span className="label-value label-patient-name">{name}</span>
          </div>
          <div className="label-fields">
            <div className="label-row">
              <span className="label-key">MR #:</span>
              <span className="label-value">{mrNumber || 'Pending'}</span>
            </div>
            <div className="label-row">
              <span className="label-key">Date:</span>
              <span className="label-value">{date}</span>
            </div>
            <div className="label-row">
              <span className="label-key">Tests:</span>
              <span className="label-value">{tests}</span>
            </div>
            <div className="label-row">
              <span className="label-key">Ref By:</span>
              <span className="label-value">{referredBy}</span>
            </div>
          </div>
          <div className="label-qr">
            <QRCodeSVG
              value={qrDetails}
              size={128}
              level="M"
              marginSize={4}
              title="Patient and test details"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
