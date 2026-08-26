import { useState } from 'react';
import { PageHeader } from '../components/primitives/PageHeader';
import { Card, CardHead, CardBody } from '../components/primitives/Card';
import { Badge } from '../components/primitives/Badge';
import { PricingModal } from '../components/PricingModal';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';
import { User, Shield, Building2, Smartphone, Mail, Phone, Calendar, CreditCard, Plus, Trash2, Crown, Sparkles } from 'lucide-react';

export default function UserProfile() {
    const { userProfile, setUserProfile, isPremium, setPremium } = useAppStore();
    const [name, setName] = useState(userProfile.name); const [email, setEmail] = useState(userProfile.email);
    const [phone, setPhone] = useState(userProfile.phone); const [pan, setPan] = useState(userProfile.pan);
    const [dob, setDob] = useState(userProfile.dob); const [showBankForm, setShowBankForm] = useState(false);
    const [showUpiForm, setShowUpiForm] = useState(false); const [bankName, setBankName] = useState('');
    const [accountNumber, setAccountNumber] = useState(''); const [ifsc, setIfsc] = useState('');
    const [upiId, setUpiId] = useState('');
    const [showPricing, setShowPricing] = useState(false);
    const [confirmCancel, setConfirmCancel] = useState(false);

    const panValid = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) || pan === '';

    const handleSave = () => setUserProfile({ ...userProfile, name, email, phone, pan, dob });
    const handleAddBank = () => { if (bankName && accountNumber && ifsc) { setUserProfile({ ...userProfile, banks: [...userProfile.banks, { name: bankName, accountNo: accountNumber, ifsc, primary: false }] }); setBankName(''); setAccountNumber(''); setIfsc(''); setShowBankForm(false); } };
    const handleAddUpi = () => { if (upiId) { setUserProfile({ ...userProfile, upiIds: [...userProfile.upiIds, upiId] }); setUpiId(''); setShowUpiForm(false); } };
    const removeBank = (i: number) => { const updated = [...userProfile.banks]; updated.splice(i, 1); setUserProfile({ ...userProfile, banks: updated }); };
    const removeUpi = (i: number) => { const updated = [...userProfile.upiIds]; updated.splice(i, 1); setUserProfile({ ...userProfile, upiIds: updated }); };

    return (
        <div className="space-y-4">
            <PageHeader
                eyebrow="Account"
                title="Your Profile"
                description="Identity, bank details and subscription. Everything here stays in your browser — nothing is sent anywhere."
            />

            {/* ═══════════════════════════════════════════════════════
                Subscription.

                This block previously carried its own full copy of the
                pricing modal, duplicated from the one in the layout and
                already drifting apart from it. It now uses the shared
                <PricingModal />.

                Cancelling also used to be a single unguarded click on
                `togglePremium`, which meant a mis-click silently
                re-subscribed you. It is now an explicit confirm that
                calls setPremium(false), and the card visibly returns to
                the free state with the upgrade path back in view.
               ═══════════════════════════════════════════════════════ */}
            <Card>
                <CardHead
                    icon={Crown}
                    title="Subscription"
                    subtitle={isPremium ? 'Premium — renews monthly' : 'Free plan'}
                    accent={isPremium ? 'var(--warn)' : 'var(--text-lo)'}
                    action={
                        <Badge tone={isPremium ? 'warn' : 'muted'}>
                            {isPremium ? 'Active' : 'Free'}
                        </Badge>
                    }
                />
                <CardBody className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold text-hi">
                            {isPremium
                                ? 'Quarterly Pulse, Learning Hub and AI Coach are unlocked'
                                : 'Quarterly Pulse, Learning Hub and AI Coach are locked'}
                        </p>
                        <p className="text-[12px] text-lo mt-1">
                            {isPremium
                                ? 'Cancelling keeps your data and takes effect immediately.'
                                : '₹499/month, or ₹4,999/year and save 16%.'}
                        </p>
                    </div>

                    {isPremium ? (
                        <button onClick={() => setConfirmCancel(true)} className="btn btn-secondary shrink-0">
                            Cancel plan
                        </button>
                    ) : (
                        <button onClick={() => setShowPricing(true)} className="btn btn-primary shrink-0">
                            <Sparkles size={14} /> Upgrade
                        </button>
                    )}
                </CardBody>
            </Card>

            <PricingModal open={showPricing} onClose={() => setShowPricing(false)} />

            {/* ─── Cancel confirmation ─── */}
            <AnimatePresence>
                {confirmCancel && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        onClick={() => setConfirmCancel(false)}
                        className="fixed inset-0 z-[100] grid place-items-center p-4"
                        style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
                        role="dialog" aria-modal="true"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.97, y: 8 }}
                            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                            onClick={(e) => e.stopPropagation()}
                            className="surface-raised w-full max-w-sm p-6"
                        >
                            <h2 className="text-[16px] font-bold text-hi">Cancel Premium?</h2>
                            <p className="text-[12.5px] text-lo mt-2 leading-relaxed">
                                You will lose Quarterly Pulse, the Learning Hub and the AI Coach
                                straight away. Your figures, holdings and lesson progress all stay
                                exactly as they are, and you can resubscribe whenever you like.
                            </p>
                            <div className="flex gap-2.5 mt-5">
                                <button onClick={() => setConfirmCancel(false)} className="btn btn-secondary flex-1">
                                    Keep Premium
                                </button>
                                <button
                                    onClick={() => { setPremium(false); setConfirmCancel(false); }}
                                    className="btn btn-danger flex-1"
                                >
                                    Cancel plan
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="surface overflow-hidden h-fit">
                    <div className="px-6 py-4 border-b border-[var(--info)]/15 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[var(--info)]/10 flex items-center justify-center border border-[var(--info)]/20"><Shield className="text-[var(--info)]" size={14} /></div>
                        <h2 className="text-hi font-semibold">Personal Details</h2>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs text-lo font-medium flex items-center gap-1.5"><User size={12} />Full Name</label>
                            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="John Doe"
                                className="w-full bg-white/[0.04] border border-[var(--accent)]/15 rounded-xl px-4 py-3 text-sm text-hi placeholder-slate-600 focus:outline-none focus:border-[var(--accent)]/40 focus:ring-2 focus:ring-[var(--accent)]/15 transition-all" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs text-lo font-medium flex items-center gap-1.5"><Mail size={12} />Email Address</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com"
                                className="w-full bg-white/[0.04] border border-[var(--accent)]/15 rounded-xl px-4 py-3 text-sm text-hi placeholder-slate-600 focus:outline-none focus:border-[var(--accent)]/40 focus:ring-2 focus:ring-[var(--accent)]/15 transition-all" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className="text-xs text-lo font-medium flex items-center gap-1.5"><Phone size={12} />Phone</label>
                                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210"
                                    className="w-full bg-white/[0.04] border border-[var(--accent)]/15 rounded-xl px-4 py-3 text-sm text-hi placeholder-slate-600 focus:outline-none focus:border-[var(--accent)]/40 focus:ring-2 focus:ring-[var(--accent)]/15 transition-all" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-lo font-medium flex items-center gap-1.5"><Calendar size={12} />Date of Birth</label>
                                <input type="date" value={dob} onChange={e => setDob(e.target.value)}
                                    className="w-full bg-white/[0.04] border border-[var(--accent)]/15 rounded-xl px-4 py-3 text-sm text-hi placeholder-slate-600 focus:outline-none focus:border-[var(--accent)]/40 focus:ring-2 focus:ring-[var(--accent)]/15 transition-all [color-scheme:dark]" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs text-lo font-medium flex items-center gap-1.5"><CreditCard size={12} />PAN Number</label>
                            <input type="text" value={pan} onChange={e => setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10}
                                className={`w-full bg-white/[0.04] border rounded-xl px-4 py-3 text-sm text-hi placeholder-slate-600 focus:outline-none focus:ring-2 transition-all tracking-wider font-mono ${panValid ? 'border-[var(--accent)]/15 focus:border-[var(--accent)]/40 focus:ring-[var(--accent)]/15' : 'border-[var(--loss)]/40 focus:border-[var(--loss)]/60 focus:ring-[var(--loss)]/15'}`} />
                            {!panValid && <p className="text-[10px] text-[var(--loss)]" style={{ textShadow: '0 0 4px rgba(255,77,109,0.3)' }}>Invalid PAN format (e.g. ABCDE1234F)</p>}
                        </div>
                        <button onClick={handleSave} className="btn btn-primary w-full py-3 text-sm mt-2">Save Details</button>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="surface overflow-hidden">
                        <div className="px-6 py-4 border-b border-[var(--accent)]/10 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center border border-[var(--accent)]/20"><Building2 className="text-[var(--accent)]" size={14} /></div>
                                <h2 className="text-hi font-semibold">Bank Accounts</h2>
                            </div>
                            <button onClick={() => setShowBankForm(!showBankForm)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-semibold border border-[var(--accent)]/20 hover:bg-[var(--accent)]/15 transition-all"><Plus size={12} /> Add Bank</button>
                        </div>
                        <div className="p-4 space-y-2">
                            {userProfile.banks.length === 0 && !showBankForm && <p className="text-faint text-sm text-center py-4">No bank accounts linked yet.</p>}
                            {userProfile.banks.map((bank: { name: string; accountNo: string; ifsc: string; primary: boolean }, i: number) => (
                                <div key={i} className="rounded-xl p-3.5 bg-white/[0.02] border border-white/[0.06] flex items-center justify-between hover:border-[var(--accent)]/15 transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center border border-[var(--accent)]/20"><Building2 className="text-[var(--accent)]" size={14} /></div>
                                        <div><p className="text-sm text-hi font-medium">{bank.name}</p><p className="text-[10px] text-faint font-mono">A/c: ****{bank.accountNo.slice(-4)} · IFSC: {bank.ifsc}</p></div>
                                    </div>
                                    <button onClick={() => removeBank(i)} className="p-1.5 rounded-lg hover:bg-[var(--loss)]/10 text-faint hover:text-[var(--loss)] transition-all"><Trash2 size={14} /></button>
                                </div>
                            ))}
                            {showBankForm && (
                                <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-4 space-y-3">
                                    <p className="text-xs text-[var(--accent)] font-semibold uppercase tracking-wider" style={{ textShadow: '0 0 6px rgba(0,232,134,0.3)' }}>Add Bank Account</p>
                                    <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Bank Name"
                                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-hi placeholder-slate-600 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-1 focus:ring-[var(--accent)]/15 transition-all" />
                                    <div className="grid grid-cols-2 gap-2">
                                        <input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="Account Number"
                                            className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-hi placeholder-slate-600 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-1 focus:ring-[var(--accent)]/15 transition-all font-mono" />
                                        <input type="text" value={ifsc} onChange={e => setIfsc(e.target.value.toUpperCase())} placeholder="IFSC Code"
                                            className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-hi placeholder-slate-600 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-1 focus:ring-[var(--accent)]/15 transition-all font-mono" />
                                    </div>
                                    <div className="flex gap-2 pt-1">
                                        <button onClick={() => setShowBankForm(false)} className="flex-1 px-4 py-2.5 btn btn-secondary rounded-xl text-xs font-semibold">Cancel</button>
                                        <button onClick={handleAddBank} className="flex-1 px-4 py-2.5 btn btn-primary rounded-xl text-xs">Add Bank</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="surface overflow-hidden">
                        <div className="px-6 py-4 border-b border-[var(--loss)]/10 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-[var(--loss)]/10 flex items-center justify-center border border-[var(--loss)]/20"><Smartphone className="text-[var(--loss)]" size={14} /></div>
                                <h2 className="text-hi font-semibold">UPI IDs</h2>
                            </div>
                            <button onClick={() => setShowUpiForm(!showUpiForm)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--loss)]/10 text-[var(--loss)] text-xs font-semibold border border-[var(--loss)]/20 hover:bg-[var(--loss)]/15 transition-all"><Plus size={12} /> Add UPI</button>
                        </div>
                        <div className="p-4 space-y-2">
                            {userProfile.upiIds.length === 0 && !showUpiForm && <p className="text-faint text-sm text-center py-4">No UPI IDs linked yet.</p>}
                            {userProfile.upiIds.map((upi, i) => (
                                <div key={i} className="rounded-xl p-3.5 bg-white/[0.02] border border-white/[0.06] flex items-center justify-between hover:border-[var(--loss)]/15 transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-[var(--loss)]/10 flex items-center justify-center border border-[var(--loss)]/20"><Smartphone className="text-[var(--loss)]" size={14} /></div>
                                        <span className="text-sm text-hi font-mono">{upi}</span>
                                    </div>
                                    <button onClick={() => removeUpi(i)} className="p-1.5 rounded-lg hover:bg-[var(--loss)]/10 text-faint hover:text-[var(--loss)] transition-all"><Trash2 size={14} /></button>
                                </div>
                            ))}
                            {showUpiForm && (
                                <div className="rounded-xl border border-[var(--loss)]/20 bg-[var(--loss)]/5 p-4 space-y-3">
                                    <p className="text-xs text-[var(--loss)] font-semibold uppercase tracking-wider" style={{ textShadow: '0 0 6px rgba(255,77,109,0.3)' }}>Add UPI ID</p>
                                    <input type="text" value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="name@upi or 9876543210@paytm"
                                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-hi placeholder-slate-600 focus:outline-none focus:border-[var(--loss)]/30 focus:ring-1 focus:ring-[var(--loss)]/15 transition-all font-mono" />
                                    <div className="flex gap-2 pt-1">
                                        <button onClick={() => setShowUpiForm(false)} className="flex-1 px-4 py-2.5 btn btn-secondary rounded-xl text-xs font-semibold">Cancel</button>
                                        <button onClick={handleAddUpi} className="btn btn-primary flex-1 !py-2 !text-[12px]">Add UPI</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
