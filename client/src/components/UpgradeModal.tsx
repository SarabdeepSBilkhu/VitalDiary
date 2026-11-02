import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Check, X, ShieldCheck, Zap, ArrowRight, Loader2 } from 'lucide-react';
import { api, getCurrentUser, setCurrentUser } from '../utils/api';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  featureTrigger?: string;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  featureTrigger
}) => {
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Dynamically load Razorpay standard checkout script if not present
  useEffect(() => {
    if (window.Razorpay) return;
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onerror = () => console.warn('Razorpay script could not be loaded.');
    document.body.appendChild(script);
  }, []);

  if (!isOpen) return null;

  const handleUpgrade = async () => {
    setLoading(true);
    setError(null);

    const currentUser = getCurrentUser();

    try {
      // 1. Attempt official Razorpay Checkout Order
      let orderData: any = null;
      try {
        orderData = await api.createRazorpayOrder(selectedPlan);
      } catch (orderErr: any) {
        // If server indicates Razorpay keys are not yet configured in .env, gracefully fallback to simulated upgrade
        if (orderErr?.message?.includes('RAZORPAY_NOT_CONFIGURED') || orderErr?.status === 400) {
          console.info('Razorpay keys not configured; performing simulated test upgrade.');
          await api.simulateSubscriptionUpgrade(selectedPlan, 'upgrade');
          if (currentUser) {
            currentUser.tier = 'premium';
            setCurrentUser(currentUser);
          }
          if (onSuccess) onSuccess();
          onClose();
          return;
        }
        throw orderErr;
      }

      // 2. If Order was created and Razorpay SDK is available, open checkout popup
      if (orderData && window.Razorpay) {
        const options = {
          key: orderData.keyId,
          amount: orderData.amount,
          currency: orderData.currency || 'INR',
          name: 'VitalDiary',
          description: orderData.planName || 'VitalDiary Premium Subscription',
          order_id: orderData.orderId,
          prefill: {
            email: currentUser?.email || '',
            contact: ''
          },
          theme: {
            color: '#48c774'
          },
          // Explicitly prioritize and enable UPI payment methods (GPay, PhonePe, Paytm, QR)
          config: {
            display: {
              blocks: {
                upi: {
                  name: 'Pay via UPI / QR',
                  instruments: [
                    { method: 'upi' }
                  ]
                },
                other: {
                  name: 'Cards & Other Methods',
                  instruments: [
                    { method: 'card' },
                    { method: 'netbanking' },
                    { method: 'wallet' }
                  ]
                }
              },
              sequence: ['block.upi', 'block.other'],
              preferences: {
                show_default_blocks: true
              }
            }
          },
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) => {
            try {
              setLoading(true);
              await api.verifyRazorpayPayment({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                plan: selectedPlan
              });
              if (onSuccess) onSuccess();
              onClose();
            } catch (verifyErr: any) {
              setError(verifyErr?.message || 'Payment verification failed.');
            } finally {
              setLoading(false);
            }
          },
          modal: {
            ondismiss: () => {
              setLoading(false);
            }
          }
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
        return;
      }

      // Fallback
      await api.simulateSubscriptionUpgrade(selectedPlan, 'upgrade');
      if (currentUser) {
        currentUser.tier = 'premium';
        setCurrentUser(currentUser);
      }
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Upgrade failed. Please try again.');
      setLoading(false);
    }
  };

  return createPortal(
    <div className="modal-overlay active" onClick={onClose} style={{ zIndex: 9999 }}>
      <div 
        className="modal-card upgrade-modal-card" 
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '640px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="modal-header d-flex justify-between align-center">
          <div className="d-flex align-center gap-2">
            <div className="premium-star-icon">
              <Sparkles size={20} className="color-primary" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Upgrade to VitalDiary Premium</h3>
              <p className="text-xs text-secondary" style={{ margin: '2px 0 0 0' }}>
                Complete health intelligence & clinical tracking
              </p>
            </div>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '1rem 0' }}>
          {featureTrigger && (
            <div className="upgrade-trigger-alert mb-3">
              <Zap size={16} className="color-primary" style={{ flexShrink: 0 }} />
              <span className="text-xs">
                <strong>{featureTrigger}</strong> is a Premium feature. Upgrade your plan to unlock full access.
              </span>
            </div>
          )}

          {/* Plan Picker Tabs */}
          <div className="d-flex gap-3 mb-4">
            <div 
              className={`plan-selector-card ${selectedPlan === 'monthly' ? 'selected' : ''}`}
              onClick={() => setSelectedPlan('monthly')}
            >
              <div className="d-flex justify-between align-center mb-1">
                <span className="font-bold text-sm">Monthly</span>
                <span className="plan-price-tag">₹199<small>/mo</small></span>
              </div>
              <p className="text-xs text-secondary" style={{ margin: 0 }}>
                Cancel anytime. Flexible monthly billing.
              </p>
            </div>

            <div 
              className={`plan-selector-card ${selectedPlan === 'yearly' ? 'selected' : ''}`}
              onClick={() => setSelectedPlan('yearly')}
            >
              <div className="d-flex justify-between align-center mb-1">
                <div className="d-flex align-center gap-2">
                  <span className="font-bold text-sm">Yearly</span>
                  <span className="badge badge-success text-xs" style={{ fontSize: '0.68rem', padding: '1px 5px' }}>SAVE ~17%</span>
                </div>
                <span className="plan-price-tag">₹1,999<small>/yr</small></span>
              </div>
              <p className="text-xs text-secondary" style={{ margin: 0 }}>
                ₹166/month billed annually. Best value.
              </p>
            </div>
          </div>

          {/* Feature Comparison Grid */}
          <div className="upgrade-comparison-table mb-4">
            <div className="comparison-row header-row">
              <span>Capability</span>
              <span className="comparison-cell-center">Free</span>
              <span className="comparison-cell-center" style={{ color: 'var(--color-primary)' }}>Premium</span>
            </div>

            <div className="comparison-row">
              <span>Blood Pressure, Glucose & Weight</span>
              <span className="comparison-cell-center"><Check size={16} className="color-success" /></span>
              <span className="comparison-cell-center"><Check size={16} className="color-primary" /></span>
            </div>

            <div className="comparison-row">
              <span>Heart Rate & Additional Vitals (SpO₂)</span>
              <span className="comparison-cell-center text-muted">—</span>
              <span className="comparison-cell-center"><Check size={16} className="color-primary" /></span>
            </div>

            <div className="comparison-row">
              <span>Medications & Dosage Management</span>
              <span className="comparison-cell-center text-muted">—</span>
              <span className="comparison-cell-center"><Check size={16} className="color-primary" /></span>
            </div>

            <div className="comparison-row">
              <span>Medical & Lab Reports (CBC, LFT, Lipid...)</span>
              <span className="comparison-cell-center text-muted">—</span>
              <span className="comparison-cell-center"><Check size={16} className="color-primary" /></span>
            </div>

            <div className="comparison-row">
              <span>AI Health Assistant</span>
              <span className="comparison-cell-center text-xs text-muted">Standard</span>
              <span className="comparison-cell-center text-xs font-bold color-primary">Advanced</span>
            </div>

            <div className="comparison-row">
              <span>Clinical Analytics & Normal Ranges</span>
              <span className="comparison-cell-center text-xs text-muted">Basic</span>
              <span className="comparison-cell-center text-xs font-bold color-primary">Full</span>
            </div>

            <div className="comparison-row">
              <span>PDF Reports</span>
              <span className="comparison-cell-center text-xs text-muted">Text Tables</span>
              <span className="comparison-cell-center text-xs font-bold color-primary">With Graphs</span>
            </div>

            <div className="comparison-row">
              <span>CSV Import & JSON Database Backup</span>
              <span className="comparison-cell-center text-muted">—</span>
              <span className="comparison-cell-center"><Check size={16} className="color-primary" /></span>
            </div>
          </div>

          {error && (
            <div className="text-danger text-xs mb-3 text-center">
              {error}
            </div>
          )}

          <div className="d-flex flex-column gap-2">
            <button 
              className="btn btn-primary w-100 d-flex align-center justify-center gap-2 py-3"
              onClick={handleUpgrade}
              disabled={loading}
              style={{ fontSize: '0.95rem', fontWeight: 700 }}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Processing Checkout...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Upgrade via Razorpay ({selectedPlan === 'monthly' ? '₹199 / month' : '₹1,999 / year'})
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            <div className="d-flex align-center justify-center gap-2 text-muted text-xs mt-2">
              <ShieldCheck size={14} />
              <span>Razorpay UPI AutoPay, NetBanking & Cards • Cancel anytime</span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
