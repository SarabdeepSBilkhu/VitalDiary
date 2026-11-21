import React from 'react';
import { createPortal } from 'react-dom';
import { X, Shield, FileText, Phone, RotateCcw, AlertTriangle } from 'lucide-react';

export type PolicyModalType = 'privacy' | 'terms' | 'contact' | 'refund' | 'pricing' | null;

interface PolicyModalProps {
  type: PolicyModalType;
  onClose: () => void;
}

export const PolicyModal: React.FC<PolicyModalProps> = ({ type, onClose }) => {
  if (!type) return null;

  return createPortal(
    <div className="modal-overlay active" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ zIndex: 10001 }}>
      <div className="modal-card" style={{ maxWidth: '640px', width: '92%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header d-flex justify-between align-center border-bottom pb-3">
          <div className="d-flex align-center gap-2">
            {type === 'privacy' && <Shield className="color-primary" size={20} />}
            {type === 'terms' && <FileText className="color-primary" size={20} />}
            {type === 'contact' && <Phone className="color-primary" size={20} />}
            {type === 'refund' && <RotateCcw className="color-primary" size={20} />}
            {type === 'pricing' && <FileText className="color-primary" size={20} />}
            <h3 style={{ margin: 0, textTransform: 'capitalize' }}>
              {type === 'privacy' && 'Privacy Policy'}
              {type === 'terms' && 'Terms and Conditions'}
              {type === 'contact' && 'Contact Us & Business Info'}
              {type === 'refund' && 'Cancellation & Refund Policy'}
              {type === 'pricing' && 'Plans & Pricing Details'}
            </h3>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto', padding: '1.25rem 0.5rem', fontSize: '0.88rem', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
          {type === 'privacy' && (
            <div>
              <p className="mb-3"><strong>Effective Date:</strong> January 1, 2026</p>
              <h4 className="font-semibold text-primary mb-1">1. Information We Collect</h4>
              <p className="mb-3">VitalDiary collects personal account credentials (email address) and user-logged health telemetry including blood pressure, pulse, SpO2, blood glucose levels, body weight, medications, and laboratory report metrics.</p>
              
              <h4 className="font-semibold text-primary mb-1">2. How Your Data Is Protected</h4>
              <p className="mb-3">Sensitive clinical metrics and notes are encrypted at rest using AES-256-GCM encryption. All data transferred between your browser and our servers is secured over TLS/HTTPS with HSTS enforced. We never sell, rent, or trade your personal or health data to third parties.</p>

              <h4 className="font-semibold text-primary mb-1">3. Payment Information</h4>
              <p className="mb-3">Payments are processed directly and securely via Razorpay (PCI-DSS compliant payment gateway). VitalDiary does not store credit/debit card numbers, CVVs, or UPI PINs on its servers.</p>

              <h4 className="font-semibold text-primary mb-1">4. Data Ownership & Export</h4>
              <p>You retain 100% ownership of your health records. You can export complete summaries to PDF or delete your account and associated records at any time from System Settings.</p>
            </div>
          )}

          {type === 'terms' && (
            <div>
              <p className="mb-3"><strong>Last Updated:</strong> January 1, 2026</p>
              <div className="mb-3" style={{ background: 'rgba(235, 148, 50, 0.1)', border: '1px solid rgba(235, 148, 50, 0.3)', borderRadius: '8px', padding: '1rem' }}>
                <p className="d-flex align-center gap-2 font-semibold color-warning mb-2" style={{ fontSize: '0.9rem' }}>
                  <AlertTriangle size={16} /> Clinical & Medical Disclaimer
                </p>
                <p style={{ fontSize: '0.82rem', margin: 0, lineHeight: '1.6' }}>
                  VitalDiary is a personal health logging and tracking tool. It does not provide medical diagnoses, treatment plans, or emergency services. Always consult a qualified medical professional for health emergencies or clinical decisions.
                </p>
              </div>

              <h4 className="font-semibold text-primary mb-1">1. User Accounts</h4>
              <p className="mb-3">You are responsible for maintaining the confidentiality of your account credentials. You agree to use the service only for lawful self-tracking or authorized family member health records.</p>

              <h4 className="font-semibold text-primary mb-1">2. Subscription Services</h4>
              <p className="mb-3">VitalDiary offers a Free tier with basic vitals logging and a Premium tier providing advanced clinical laboratory reports, ABG metrics, medication reminders, and vector-enabled AI health summaries.</p>

              <h4 className="font-semibold text-primary mb-1">3. Service Availability</h4>
              <p>We strive for continuous 99.9% service availability, but cannot guarantee uninterrupted service during planned maintenance or upstream cloud infrastructure events.</p>
            </div>
          )}

          {type === 'refund' && (
            <div>
              <p className="mb-3"><strong>Cancellation and Refund Policy:</strong></p>
              <h4 className="font-semibold text-primary mb-1">1. Cancellation Policy</h4>
              <p className="mb-3">You can cancel your subscription at any time. When cancelled, your Premium access remains active until the end of the current billing cycle (monthly or yearly), after which no further recurring charges will be made.</p>

              <h4 className="font-semibold text-primary mb-1">2. Refund Eligibility</h4>
              <p className="mb-3">We offer a <strong>7-day full refund guarantee</strong> for first-time Premium subscribers. If you are unsatisfied with VitalDiary Premium or experienced a technical billing discrepancy, contact our support team within 7 days of payment with your Razorpay payment ID for an immediate refund.</p>

              <h4 className="font-semibold text-primary mb-1">3. Refund Processing Time</h4>
              <p>Approved refunds are processed through Razorpay to the original payment source (bank account, card, or UPI) within 5–7 business days.</p>
            </div>
          )}

          {type === 'contact' && (
            <div>
              <p className="mb-3">For business inquiries, billing assistance, or technical support, please contact us:</p>
              <div className="panel mb-3" style={{ background: 'var(--bg-surface-elevated)', padding: '1.25rem' }}>
                <p className="mb-2"><strong>Platform Name:</strong> VitalDiary Health Technologies</p>
                <p className="mb-2"><strong>Email Support:</strong> <a href="mailto:sarabdeep.singh.bilkhu@gmail.com" style={{ color: 'var(--color-primary)' }}>sarabdeep.singh.bilkhu@gmail.com</a></p>
                <p className="mb-2"><strong>Support Hours:</strong> Monday – Saturday, 9:00 AM – 6:00 PM IST</p>
                <p className="mb-2"><strong>Product Type:</strong> Digital Health Diary & Wellness SaaS Subscription</p>
                <p className="mb-0"><strong>Registered Location:</strong> India</p>
              </div>
              <p className="text-xs text-muted">We typically respond to billing and support inquiries within 24 business hours.</p>
            </div>
          )}

          {type === 'pricing' && (
            <div>
              <p className="mb-3">VitalDiary provides transparent digital health SaaS subscription plans:</p>
              <div className="d-flex gap-3 flex-wrap mb-3">
                <div className="panel p-3" style={{ flex: 1, minWidth: '200px', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)' }}>
                  <h4 className="font-bold mb-1">Basic Plan</h4>
                  <div className="font-bold text-lg mb-2">Free</div>
                  <ul className="text-xs text-secondary pl-3" style={{ lineHeight: '1.8' }}>
                    <li>Blood Pressure & Glucose Logging</li>
                    <li>Body Weight Tracking</li>
                    <li>Basic 7-day Health Visualizations</li>
                    <li>Data Export in JSON</li>
                  </ul>
                </div>
                <div className="panel p-3" style={{ flex: 1, minWidth: '200px', background: 'var(--bg-surface-elevated)', border: '1px solid var(--color-primary)' }}>
                  <h4 className="font-bold mb-1 color-primary">Premium Plan</h4>
                  <div className="font-bold text-lg mb-2">₹199 / mo <span className="text-xs font-normal text-muted">(or ₹1,799 / yr)</span></div>
                  <ul className="text-xs text-secondary pl-3" style={{ lineHeight: '1.8' }}>
                    <li>Medical Lab Reports (CBC, LFT, RFT, ABG)</li>
                    <li>Pulse & SpO2 Analytics</li>
                    <li>Medication Reminders & Schedules</li>
                    <li>Clinical PDF Health Report Generation</li>
                    <li>AI Health Insights & Long-term Trends</li>
                  </ul>
                </div>
              </div>
              <p className="text-xs text-muted">All prices are in Indian Rupees (INR) with all applicable digital service taxes included.</p>
            </div>
          )}
        </div>

        <div className="modal-footer border-top pt-3 text-right">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
