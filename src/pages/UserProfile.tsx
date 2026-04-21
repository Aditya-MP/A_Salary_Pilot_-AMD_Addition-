import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { User, Shield, Building2, Smartphone, Mail, Phone, Calendar, CreditCard, Plus, Trash2, Crown, Sparkles } from 'lucide-react';

export default function UserProfile() {
    const { userProfile, setUserProfile, isPremium, togglePremium } = useAppStore();
    const [name, setName] = useState(userProfile.name); const [email, setEmail] = useState(userProfile.email);
    const [phone, setPhone] = useState(userProfile.phone); const [pan, setPan] = useState(userProfile.pan);
    const [dob, setDob] = useState(userProfile.dob); const [showBankForm, setShowBankForm] = useState(false);
    const [showUpiForm, setShowUpiForm] = useState(false); const [bankName, setBankName] = useState('');
    const [accountNumber, setAccountNumber] = useState(''); const [ifsc, setIfsc] = useState('');
    const [upiId, setUpiId] = useState('');
    const [showPricingPopup, setShowPricingPopup] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
    const [activatedMsg, setActivatedMsg] = useState(false);

    const panValid = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) || pan === '';

    const handleSave = () => setUserProfile({ ...userProfile, name, email, phone, pan, dob });
    const handleAddBank = () => { if (bankName && accountNumber && ifsc) { setUserProfile({ ...userProfile, banks: [...userProfile.banks, { name: bankName, accountNo: accountNumber, ifsc, primary: false }] }); setBankName(''); setAccountNumber(''); setIfsc(''); setShowBankForm(false); } };
    const handleAddUpi = () => { if (upiId) { setUserProfile({ ...userProfile, upiIds: [...userProfile.upiIds, upiId] }); setUpiId(''); setShowUpiForm(false); } };
    const removeBank = (i: number) => { const updated = [...userProfile.banks]; updated.splice(i, 1); setUserProfile({ ...userProfile, banks: updated }); };
    const removeUpi = (i: number) => { const updated = [...userProfile.upiIds]; updated.splice(i, 1); setUserProfile({ ...userProfile, upiIds: updated }); };

    const handleActivatePremium = () => {
        togglePremium();
        setShowPricingPopup(false);
        setActivatedMsg(true);
        setTimeout(() => setActivatedMsg(false), 3000);
    };

    return (
        <div className="p-6 lg:p-8 space-y-6">
            <div className="rounded-2xl bg-gradient-to-r from-[#ff0080] to-[#a855f7] p-6 lg:p-8" style={{ boxShadow: '0 0 30px rgba(255,0,128,0.15)' }}>
                <div className="flex items-center gap-2 mb-1"><User className="text-white/70" size={16} /><span className="text-white/70 text-xs font-bold tracking-wider uppercase">Account Settings</span></div>
                <h1 className="text-2xl lg:text-3xl font-bold text-white">Your Profile</h1>
                <p className="text-white/60 mt-1 text-sm font-medium">Manage personal & financial details</p>
            </div>

            <div className="neon-card overflow-hidden" style={{ borderColor: 'rgba(255,170,0,0.2)' }}>
                <div className="px-6 py-4 border-b border-[#ffaa00]/15 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#ffaa00]/10 flex items-center justify-center border border-[#ffaa00]/20"><Crown className="text-[#ffaa00]" size={14} /></div>
                        <h2 className="text-white font-semibold">Premium Subscription</h2>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-bold ${isPremium ? 'bg-[#ffaa00]/10 text-[#ffaa00] border border-[#ffaa00]/20' : 'bg-white/5 text-slate-500 border border-white/10'}`}>{isPremium ? 'Active' : 'Free Plan'}</div>
                </div>
                <div className="p-6 flex items-center justify-between">
                    <div>
                        <p className="text-white font-semibold text-sm">{isPremium ? 'Premium Plan Active' : 'Upgrade to unlock AI Coach, Learning, Pulse'}</p>
                        <p className="text-slate-500 text-xs mt-0.5">{isPremium ? 'Quarterly Pulse, Learning Hub, AI Coach unlocked' : 'Get advanced features with Premium'}</p>
                    </div>
                    <button onClick={() => isPremium ? togglePremium() : setShowPricingPopup(true)} className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${isPremium ? 'glass-button-secondary' : 'neon-button'}`}>
                        <span className="flex items-center gap-1.5"><Sparkles size={14} />{isPremium ? 'Cancel Plan' : 'Upgrade Now'}</span>
                    </button>
                </div>
            </div>

            {/* ── Pricing Popup Modal ── */}
            {showPricingPopup && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowPricingPopup(false)}>
                    <div className="bg-[#0a0e1a] rounded-2xl max-w-lg w-full mx-4 overflow-hidden border border-[#ffaa00]/15" onClick={e => e.stopPropagation()} style={{ boxShadow: '0 0 40px rgba(255,170,0,0.06)' }}>
                        {/* Header */}
                        <div className="px-6 pt-6 pb-4 border-b border-[#ffaa00]/10 text-center">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#ffaa00] to-[#ff6600] flex items-center justify-center mx-auto mb-3" style={{ boxShadow: '0 0 20px rgba(255,170,0,0.2)' }}>
                                <Crown className="text-black" size={22} />
                            </div>
                            <h3 className="text-xl font-bold text-white">Choose Your Plan</h3>
                            <p className="text-slate-500 text-sm mt-1">Unlock AI Coach, Learning Hub & Quarterly Pulse</p>
                        </div>

                        {/* Plan Cards */}
                        <div className="px-6 py-5 grid grid-cols-2 gap-4">
                            {/* Monthly */}
                            <button onClick={() => setSelectedPlan('monthly')}
                                className={`relative rounded-xl p-5 text-left transition-all border-2 ${selectedPlan === 'monthly' ? 'border-[#00ff88]' : 'border-white/[0.06] hover:border-white/15'}`}
                                style={selectedPlan === 'monthly' ? { background: 'rgba(0,255,136,0.04)', boxShadow: '0 0 15px rgba(0,255,136,0.06)' } : { background: 'rgba(255,255,255,0.02)' }}>
                                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">Monthly</p>
                                <p className="text-2xl font-bold text-white">₹499<span className="text-sm font-normal text-slate-500">/mo</span></p>
                                <p className="text-[10px] text-slate-500 mt-1">Billed monthly</p>
                                {selectedPlan === 'monthly' && (
                                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#00ff88] flex items-center justify-center" style={{ boxShadow: '0 0 8px rgba(0,255,136,0.4)' }}>
                                        <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                    </div>
                                )}
                            </button>

                            {/* Yearly */}
                            <button onClick={() => setSelectedPlan('yearly')}
                                className={`relative rounded-xl p-5 text-left transition-all border-2 ${selectedPlan === 'yearly' ? 'border-[#ffaa00]' : 'border-white/[0.06] hover:border-white/15'}`}
                                style={selectedPlan === 'yearly' ? { background: 'rgba(255,170,0,0.04)', boxShadow: '0 0 15px rgba(255,170,0,0.06)' } : { background: 'rgba(255,255,255,0.02)' }}>
                                <div className="flex items-center gap-2 mb-2">
                                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Yearly</p>
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#ffaa00]/10 text-[#ffaa00] border border-[#ffaa00]/20">SAVE 16%</span>
                                </div>
                                <p className="text-2xl font-bold text-white">₹4,999<span className="text-sm font-normal text-slate-500">/yr</span></p>
                                <p className="text-[10px] text-slate-500 mt-1">₹416/mo · Billed yearly</p>
                                {selectedPlan === 'yearly' && (
                                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#ffaa00] flex items-center justify-center" style={{ boxShadow: '0 0 8px rgba(255,170,0,0.4)' }}>
                                        <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                    </div>
                                )}
                            </button>
                        </div>

                        {/* Features list */}
                        <div className="px-6 pb-4">
                            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
                                {['AI Wealth Coach — personalized advice', 'Learning Hub — financial education', 'Quarterly Pulse — staged investing', 'Priority Support — 24/7 chat'].map(f => (
                                    <div key={f} className="flex items-center gap-2 text-sm text-slate-400">
                                        <div className="w-4 h-4 rounded-full bg-[#00ff88]/10 flex items-center justify-center flex-shrink-0">
                                            <svg className="w-2.5 h-2.5 text-[#00ff88]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                        </div>
                                        {f}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="px-6 pb-6 flex gap-3">
                            <button onClick={() => setShowPricingPopup(false)} className="flex-1 glass-button-secondary py-3 rounded-xl text-sm font-semibold">Cancel</button>
                            <button onClick={handleActivatePremium} className="flex-1 py-3 rounded-xl text-sm font-bold text-black transition-all hover:scale-[1.02]"
                                style={{ background: selectedPlan === 'yearly' ? 'linear-gradient(135deg, #ffaa00, #ff6600)' : 'linear-gradient(135deg, #00ff88, #00c8ff)', boxShadow: selectedPlan === 'yearly' ? '0 0 15px rgba(255,170,0,0.3)' : '0 0 15px rgba(0,255,136,0.3)' }}>
                                Continue — {selectedPlan === 'yearly' ? '₹4,999/yr' : '₹499/mo'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Activation toast */}
            {activatedMsg && <div className="fixed bottom-8 right-8 px-6 py-4 rounded-xl text-sm text-black font-bold bg-gradient-to-r from-[#ffaa00] to-[#ff6600] z-50" style={{ boxShadow: '0 0 15px rgba(255,170,0,0.3)' }}>✓ Premium {selectedPlan === 'yearly' ? 'Yearly' : 'Monthly'} Plan Activated!</div>}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="neon-card overflow-hidden h-fit">
                    <div className="px-6 py-4 border-b border-[#00c8ff]/15 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#00c8ff]/10 flex items-center justify-center border border-[#00c8ff]/20"><Shield className="text-[#00c8ff]" size={14} /></div>
                        <h2 className="text-white font-semibold">Personal Details</h2>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs text-slate-400 font-medium flex items-center gap-1.5"><User size={12} />Full Name</label>
                            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="John Doe"
                                className="w-full bg-white/[0.04] border border-[#00ff88]/15 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#00ff88]/40 focus:ring-2 focus:ring-[#00ff88]/15 transition-all" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs text-slate-400 font-medium flex items-center gap-1.5"><Mail size={12} />Email Address</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com"
                                className="w-full bg-white/[0.04] border border-[#00ff88]/15 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#00ff88]/40 focus:ring-2 focus:ring-[#00ff88]/15 transition-all" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className="text-xs text-slate-400 font-medium flex items-center gap-1.5"><Phone size={12} />Phone</label>
                                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210"
                                    className="w-full bg-white/[0.04] border border-[#00ff88]/15 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#00ff88]/40 focus:ring-2 focus:ring-[#00ff88]/15 transition-all" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-slate-400 font-medium flex items-center gap-1.5"><Calendar size={12} />Date of Birth</label>
                                <input type="date" value={dob} onChange={e => setDob(e.target.value)}
                                    className="w-full bg-white/[0.04] border border-[#00ff88]/15 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#00ff88]/40 focus:ring-2 focus:ring-[#00ff88]/15 transition-all [color-scheme:dark]" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs text-slate-400 font-medium flex items-center gap-1.5"><CreditCard size={12} />PAN Number</label>
                            <input type="text" value={pan} onChange={e => setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10}
                                className={`w-full bg-white/[0.04] border rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 transition-all tracking-wider font-mono ${panValid ? 'border-[#00ff88]/15 focus:border-[#00ff88]/40 focus:ring-[#00ff88]/15' : 'border-[#ff0080]/40 focus:border-[#ff0080]/60 focus:ring-[#ff0080]/15'}`} />
                            {!panValid && <p className="text-[10px] text-[#ff0080]" style={{ textShadow: '0 0 4px rgba(255,0,128,0.3)' }}>Invalid PAN format (e.g. ABCDE1234F)</p>}
                        </div>
                        <button onClick={handleSave} className="neon-button w-full py-3 text-sm mt-2">Save Details</button>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="neon-card overflow-hidden">
                        <div className="px-6 py-4 border-b border-[#00ff88]/10 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-[#00ff88]/10 flex items-center justify-center border border-[#00ff88]/20"><Building2 className="text-[#00ff88]" size={14} /></div>
                                <h2 className="text-white font-semibold">Bank Accounts</h2>
                            </div>
                            <button onClick={() => setShowBankForm(!showBankForm)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00ff88]/10 text-[#00ff88] text-xs font-semibold border border-[#00ff88]/20 hover:bg-[#00ff88]/15 transition-all"><Plus size={12} /> Add Bank</button>
                        </div>
                        <div className="p-4 space-y-2">
                            {userProfile.banks.length === 0 && !showBankForm && <p className="text-slate-600 text-sm text-center py-4">No bank accounts linked yet.</p>}
                            {userProfile.banks.map((bank: { name: string; accountNo: string; ifsc: string; primary: boolean }, i: number) => (
                                <div key={i} className="rounded-xl p-3.5 bg-white/[0.02] border border-white/[0.06] flex items-center justify-between hover:border-[#00ff88]/15 transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-[#00ff88]/10 flex items-center justify-center border border-[#00ff88]/20"><Building2 className="text-[#00ff88]" size={14} /></div>
                                        <div><p className="text-sm text-white font-medium">{bank.name}</p><p className="text-[10px] text-slate-500 font-mono">A/c: ****{bank.accountNo.slice(-4)} · IFSC: {bank.ifsc}</p></div>
                                    </div>
                                    <button onClick={() => removeBank(i)} className="p-1.5 rounded-lg hover:bg-[#ff0080]/10 text-slate-600 hover:text-[#ff0080] transition-all"><Trash2 size={14} /></button>
                                </div>
                            ))}
                            {showBankForm && (
                                <div className="rounded-xl border border-[#00ff88]/20 bg-[#00ff88]/5 p-4 space-y-3">
                                    <p className="text-xs text-[#00ff88] font-semibold uppercase tracking-wider" style={{ textShadow: '0 0 6px rgba(0,255,136,0.3)' }}>Add Bank Account</p>
                                    <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Bank Name"
                                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#00ff88]/30 focus:ring-1 focus:ring-[#00ff88]/15 transition-all" />
                                    <div className="grid grid-cols-2 gap-2">
                                        <input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="Account Number"
                                            className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#00ff88]/30 focus:ring-1 focus:ring-[#00ff88]/15 transition-all font-mono" />
                                        <input type="text" value={ifsc} onChange={e => setIfsc(e.target.value.toUpperCase())} placeholder="IFSC Code"
                                            className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#00ff88]/30 focus:ring-1 focus:ring-[#00ff88]/15 transition-all font-mono" />
                                    </div>
                                    <div className="flex gap-2 pt-1">
                                        <button onClick={() => setShowBankForm(false)} className="flex-1 px-4 py-2.5 glass-button-secondary rounded-xl text-xs font-semibold">Cancel</button>
                                        <button onClick={handleAddBank} className="flex-1 px-4 py-2.5 neon-button rounded-xl text-xs">Add Bank</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="neon-card overflow-hidden">
                        <div className="px-6 py-4 border-b border-[#ff0080]/10 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-[#ff0080]/10 flex items-center justify-center border border-[#ff0080]/20"><Smartphone className="text-[#ff0080]" size={14} /></div>
                                <h2 className="text-white font-semibold">UPI IDs</h2>
                            </div>
                            <button onClick={() => setShowUpiForm(!showUpiForm)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ff0080]/10 text-[#ff0080] text-xs font-semibold border border-[#ff0080]/20 hover:bg-[#ff0080]/15 transition-all"><Plus size={12} /> Add UPI</button>
                        </div>
                        <div className="p-4 space-y-2">
                            {userProfile.upiIds.length === 0 && !showUpiForm && <p className="text-slate-600 text-sm text-center py-4">No UPI IDs linked yet.</p>}
                            {userProfile.upiIds.map((upi, i) => (
                                <div key={i} className="rounded-xl p-3.5 bg-white/[0.02] border border-white/[0.06] flex items-center justify-between hover:border-[#ff0080]/15 transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-[#ff0080]/10 flex items-center justify-center border border-[#ff0080]/20"><Smartphone className="text-[#ff0080]" size={14} /></div>
                                        <span className="text-sm text-white font-mono">{upi}</span>
                                    </div>
                                    <button onClick={() => removeUpi(i)} className="p-1.5 rounded-lg hover:bg-[#ff0080]/10 text-slate-600 hover:text-[#ff0080] transition-all"><Trash2 size={14} /></button>
                                </div>
                            ))}
                            {showUpiForm && (
                                <div className="rounded-xl border border-[#ff0080]/20 bg-[#ff0080]/5 p-4 space-y-3">
                                    <p className="text-xs text-[#ff0080] font-semibold uppercase tracking-wider" style={{ textShadow: '0 0 6px rgba(255,0,128,0.3)' }}>Add UPI ID</p>
                                    <input type="text" value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="name@upi or 9876543210@paytm"
                                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#ff0080]/30 focus:ring-1 focus:ring-[#ff0080]/15 transition-all font-mono" />
                                    <div className="flex gap-2 pt-1">
                                        <button onClick={() => setShowUpiForm(false)} className="flex-1 px-4 py-2.5 glass-button-secondary rounded-xl text-xs font-semibold">Cancel</button>
                                        <button onClick={handleAddUpi} className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#ff0080] to-[#ff4da6]" style={{ boxShadow: '0 0 12px rgba(255,0,128,0.3)' }}>Add UPI</button>
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
