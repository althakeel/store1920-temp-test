'use client'
import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, Loader2, Sparkles, ShoppingBag, Globe } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { useStorefrontMarket } from '@/lib/useStorefrontMarket';
import { getProductPath } from '@/lib/productUrl';
import CurrencySymbol from '@/components/CurrencySymbol';

const Chatbot = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [hasAutoOpened, setHasAutoOpened] = useState(false);
    const [language, setLanguage] = useState('english');
    const [showLanguageMenu, setShowLanguageMenu] = useState(false);
    const [messages, setMessages] = useState([
        {
            role: 'assistant',
            content: "hey! 👋 I can help you with products, orders, shipping, returns, payments, coupons, and all our policies. what do you need?",
            timestamp: new Date().toISOString()
        }
    ]);
    const [inputMessage, setInputMessage] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [products, setProducts] = useState([]);
    const { market, convertPrice } = useStorefrontMarket();
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const languageSelectorRef = useRef(null);

    const greetings = {
        english: "hey! 👋 I can help you with products, orders, shipping, returns, payments, coupons, and all our policies. what do you need?",
        hindi: "नमस्ते! 👋 मैं आपको उत्पादों, ऑर्डर, शिपिंग, रिटर्न, पेमेंट, कूपन और सभी पॉलिसी के बारे में बता सकता हूं। क्या चाहिए?",
        malayalam: "ഹായ്! 👋 ഞാൻ നിങ്ങളെ ഉൽപ്പന്നങ്ങൾ, ഓർഡറുകൾ, ഷിപ്പിംഗ്, റിട്ടേൺ, പേയ്മെന്റ്, കൂപ്പണുകൾ, എല്ലാ പോളിസികളും കുറിച്ച് സഹായിക്കാം. എന്ത് വേണം?"
    };

    const handleLanguageChange = (newLang) => {
        setLanguage(newLang);
        setShowLanguageMenu(false);
        // Update first message with new language
        setMessages(prev => [
            {
                role: 'assistant',
                content: greetings[newLang],
                timestamp: new Date().toISOString()
            },
            ...prev.slice(1)
        ]);
    };

    const getLanguageLabel = () => {
        if (language === 'hindi') return '🇮🇳 हिंदी';
        if (language === 'malayalam') return '🇮🇳 മലയാളം';
        return '🇬🇧 English';
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    // Auto-open chatbot disabled - only opens on click
    // useEffect(() => {
    //     if (!hasAutoOpened) {
    //         // Auto-open chat on page load
    //         const openTimer = setTimeout(() => {
    //             setIsOpen(true);
    //             setHasAutoOpened(true);
    //         }, 1000);

    //         return () => clearTimeout(openTimer);
    //     }
    // }, [hasAutoOpened]);

    // Close language menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showLanguageMenu && languageSelectorRef.current && !languageSelectorRef.current.contains(event.target)) {
                setShowLanguageMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showLanguageMenu]);

    const searchProducts = async (query) => {
        try {
            const { data } = await axios.get(`/api/products?search=${query}&limit=4`);
            return data.products || data || [];
        } catch (error) {
            console.error('Product search error:', error);
            return [];
        }
    };

    // Comprehensive website content search
    const searchWebsiteContent = async (query) => {
        try {
            // Search across multiple endpoints for comprehensive results
            const [productsRes, faqRes, pagesRes] = await Promise.all([
                axios.get(`/api/products?search=${query}&limit=3`).catch(() => ({ data: { products: [] } })),
                axios.get(`/api/faq?search=${query}&limit=2`).catch(() => ({ data: { faqs: [] } })),
                axios.get(`/api/pages?search=${query}&limit=2`).catch(() => ({ data: { pages: [] } }))
            ]);

            return {
                products: productsRes.data.products || productsRes.data || [],
                faqs: faqRes.data.faqs || [],
                pages: pagesRes.data.pages || [],
                all: [
                    ...(productsRes.data.products || productsRes.data || []).map(p => ({ ...p, type: 'product' })),
                    ...(faqRes.data.faqs || []).map(f => ({ ...f, type: 'faq' })),
                    ...(pagesRes.data.pages || []).map(p => ({ ...p, type: 'page' }))
                ]
            };
        } catch (error) {
            console.error('Website search error:', error);
            return { products: [], faqs: [], pages: [], all: [] };
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        
        if (!inputMessage.trim()) return;

        const userMessage = {
            role: 'user',
            content: inputMessage,
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputMessage('');
        setIsTyping(true);

        try {
            // Build conversation history (last 10 messages for context) including current message
            const conversationHistory = [...messages.slice(-10), userMessage].map(msg => ({
                role: msg.role,
                content: typeof msg.content === 'string' ? msg.content : 'Searched website'
            }));

            const { data } = await axios.post('/api/chatbot', {
                message: inputMessage,
                conversationHistory,
                language
            });

            const assistantMessage = {
                role: 'assistant',
                content: data.message,
                timestamp: data.timestamp
            };

            setMessages(prev => [...prev, assistantMessage]);

        } catch (error) {
            console.error('Chatbot error:', error);
            const errorMessage = {
                role: 'assistant',
                content: error?.response?.data?.error || error.message || "I apologize, but I'm having trouble responding right now. Please try again or contact our support team for assistance.",
                timestamp: new Date().toISOString(),
                isError: true
            };
            setMessages(prev => [...prev, errorMessage]);
            toast.error(error?.response?.data?.error || 'Failed to get response. Please try again.');
        } finally {
            setIsTyping(false);
        }
    };

    const quickQuestions = {
        english: [
            "what's your return policy?",
            "any deals or coupons?",
            "how long is shipping?",
            "what payment methods work?"
        ],
        hindi: [
            "रिटर्न पॉलिसी क्या है?",
            "कोई डील या कूपन है?",
            "शिपिंग में कितना समय?",
            "कौन से पेमेंट तरीके चलते हैं?"
        ],
        malayalam: [
            "റിട്ടേൺ പോളിസി എന്താണ്?",
            "എന്തെങ്കിലും ഡീലുകൾ അല്ലെങ്കിൽ കൂപ്പണുകൾ?",
            "ഷിപ്പിംഗ് എത്ര സമയം എടുക്കും?",
            "ഏത് പേയ്മെന്റ് രീതികൾ പ്രവർത്തിക്കുന്നു?"
        ]
    };

    const handleQuickQuestion = (question) => {
        setInputMessage(question);
        if (inputRef.current) {
            inputRef.current.focus();
        }
    };

    return (
        <>

            {/* Chat Toggle Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    style={{ background: 'linear-gradient(135deg, #E6003E 0%, #691223 100%)' }}
                    className="hidden md:flex fixed bottom-6 right-6 z-50 w-16 h-16 text-white rounded-full shadow-2xl hover:shadow-3xl transition-all transform hover:scale-110 group items-center justify-center border-2 border-white/20"
                    aria-label="Open chat"
                >
                    <div className="relative">
                        <MessageCircle size={36} className="group-hover:scale-110 transition-transform drop-shadow-md" />
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-400 rounded-full border-3 border-white animate-pulse shadow-lg"></span>
                    </div>
                    <div className="absolute -top-16 right-0 bg-gradient-to-r from-gray-800 to-slate-900 text-white text-sm px-4 py-3 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-semibold shadow-2xl border border-white/10">
                        💬 Chat with QuickAI
                    </div>
                </button>
            )}

            {/* Chat Window */}
            {isOpen && (
                <div className="hidden md:flex fixed bottom-6 right-6 z-50 w-full max-w-md bg-gradient-to-b from-white to-gray-50 rounded-3xl shadow-3xl flex flex-col overflow-hidden border border-white/80 animate-in slide-in-from-bottom-5" style={{ height: '600px' }}>
                    
                    {/* Header - Professional Design */}
                    <div style={{ background: 'linear-gradient(90deg, #E6003E 0%, #691223 100%)' }} className="text-white p-5 rounded-t-3xl">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
                                        <MessageCircle size={22} className="text-white" />
                                    </div>
                                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-3 border-white shadow-lg"></span>
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg tracking-tight">QuickAI</h3>
                                    <p className="text-xs text-white/80 font-medium">Shopping Assistant</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="hover:bg-white/20 p-2 rounded-full transition-all duration-200 hover:scale-110"
                                aria-label="Close chat"
                            >
                                <X size={22} />
                            </button>
                        </div>
                        {/* Language Selector - Compact Button with Dropdown */}
                        <div ref={languageSelectorRef} className="flex justify-center relative">
                            <button
                                onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                                className="flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full text-xs font-bold text-white hover:bg-white/30 transition-all duration-300"
                            >
                                <Globe size={16} />
                                <span>{getLanguageLabel()}</span>
                            </button>
                            
                            {/* Language Dropdown Menu */}
                            {showLanguageMenu && (
                                <div className="absolute top-full mt-2 bg-white rounded-2xl shadow-2xl overflow-hidden z-10 animate-in slide-in-from-top-2 min-w-[160px]">
                                    <button
                                        onClick={() => handleLanguageChange('english')}
                                        className={`w-full px-4 py-3 text-left text-sm font-semibold transition-colors ${
                                            language === 'english'
                                                ? 'bg-pink-50 text-pink-700'
                                                : 'text-gray-700 hover:bg-gray-50'
                                        }`}
                                    >
                                        🇬🇧 English
                                    </button>
                                    <button
                                        onClick={() => handleLanguageChange('hindi')}
                                        className={`w-full px-4 py-3 text-left text-sm font-semibold transition-colors ${
                                            language === 'hindi'
                                                ? 'bg-pink-50 text-pink-700'
                                                : 'text-gray-700 hover:bg-gray-50'
                                        }`}
                                    >
                                        🇮🇳 हिंदी
                                    </button>
                                    <button
                                        onClick={() => handleLanguageChange('malayalam')}
                                        className={`w-full px-4 py-3 text-left text-sm font-semibold transition-colors border-t border-gray-100 ${
                                            language === 'malayalam'
                                                ? 'bg-pink-50 text-pink-700'
                                                : 'text-gray-700 hover:bg-gray-50'
                                        }`}
                                    >
                                        🇮🇳 മലയാളം
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Messages Container */}
                    <div className="flex-1 overflow-y-auto p-5 bg-gradient-to-b from-white to-gray-50 space-y-4 scrollbar-hide">
                        <div className="space-y-4">
                            {messages.map((msg, index) => (
                                <div
                                    key={index}
                                    className={`flex gap-3 animate-in fade-in slide-in-from-bottom-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    {msg.role === 'assistant' && (
                                        <div style={{ background: 'linear-gradient(135deg, #E6003E 0%, #691223 100%)' }} className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-1 shadow-md border border-white/20">
                                            <MessageCircle size={18} className="text-white" />
                                        </div>
                                    )}
                                    
                                    <div
                                        style={msg.role === 'user' ? { background: 'linear-gradient(90deg, #E6003E 0%, #691223 100%)' } : {}}
                                        className={`max-w-[75%] rounded-2xl px-4 py-3 transition-all duration-200 ${
                                            msg.role === 'user'
                                                ? 'text-white rounded-br-none shadow-md'
                                                : msg.isError
                                                ? 'bg-red-50 text-red-800 border-l-4 border-red-400 rounded-bl-none shadow-sm'
                                                : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none shadow-sm'
                                        }`}
                                    >
                                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words font-medium">
                                            {msg.content}
                                        </p>
                                        
                                        {/* Search Results Display - Products, FAQs, Pages */}
                                        {msg.hasSearchResults && msg.searchResults && (
                                            <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
                                                {/* Products */}
                                                {msg.searchResults.products && msg.searchResults.products.length > 0 && (
                                                    <div>
                                                        {msg.searchResults.products.map((product, pIdx) => (
                                                            <Link
                                                                key={pIdx}
                                                                href={getProductPath(product)}
                                                                className="block p-2 mb-2 bg-blue-100 border border-blue-300 rounded-lg hover:bg-blue-200 transition-colors"
                                                            >
                                                                <div className="flex gap-2">
                                                                    {product.images && product.images[0] && (
                                                                        <img
                                                                            src={product.images[0]}
                                                                            alt={product.name}
                                                                            className="w-12 h-12 object-cover rounded"
                                                                        />
                                                                    )}
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-xs font-bold text-blue-900">🛍️ {product.name}</p>
                                                                        <p className="inline-flex items-baseline gap-1 text-xs text-blue-700">
                                                                            <CurrencySymbol currency={market.currency} />
                                                                            {Math.round(convertPrice(Number(product.price) || 0))}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </Link>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* FAQs */}
                                                {msg.searchResults.faqs && msg.searchResults.faqs.length > 0 && (
                                                    <div>
                                                        {msg.searchResults.faqs.map((faq, fIdx) => (
                                                            <div
                                                                key={fIdx}
                                                                className="p-2 mb-2 bg-amber-100 border border-amber-300 rounded-lg"
                                                            >
                                                                <p className="text-xs font-bold text-amber-900">❓ {faq.question}</p>
                                                                <p className="text-xs text-amber-800 mt-1 line-clamp-2">{faq.answer}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Pages/Policies */}
                                                {msg.searchResults.pages && msg.searchResults.pages.length > 0 && (
                                                    <div>
                                                        {msg.searchResults.pages.map((page, pgIdx) => (
                                                            <Link
                                                                key={pgIdx}
                                                                href={page.url || `/${page.slug}`}
                                                                className="block p-2 mb-2 bg-green-100 border border-green-300 rounded-lg hover:bg-green-200 transition-colors"
                                                            >
                                                                <p className="text-xs font-bold text-green-900">📄 {page.title}</p>
                                                                <p className="text-xs text-green-700 line-clamp-2">{page.description}</p>
                                                            </Link>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <p className={`text-xs mt-1 ${
                                            msg.role === 'user' ? 'text-white/70' : 'text-gray-400'
                                        }`}>
                                            {new Date(msg.timestamp).toLocaleTimeString([], { 
                                                hour: '2-digit', 
                                                minute: '2-digit' 
                                            })}
                                        </p>
                                    </div>

                                    {msg.role === 'user' && (
                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0 mt-1 shadow-md border border-white/20">
                                            <User size={18} className="text-white" />
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Typing Indicator */}
                            {isTyping && (
                                <div className="flex gap-3 justify-start">
                                    <div style={{ background: 'linear-gradient(135deg, #E6003E 0%, #691223 100%)' }} className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-md border border-white/20">
                                        <Bot size={18} className="text-white" />
                                    </div>
                                    <div className="bg-white border-2 border-gray-200 rounded-2xl rounded-bl-none px-5 py-3 shadow-sm">
                                        <div className="flex gap-1.5">
                                            <span className="w-2.5 h-2.5 rounded-full animate-bounce" style={{ backgroundColor: '#E6003E', animationDelay: '0ms' }}></span>
                                            <span className="w-2.5 h-2.5 rounded-full animate-bounce" style={{ backgroundColor: '#A8091E', animationDelay: '150ms' }}></span>
                                            <span className="w-2.5 h-2.5 rounded-full animate-bounce" style={{ backgroundColor: '#691223', animationDelay: '300ms' }}></span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Quick Questions - Show only initially */}
                        {messages.length <= 1 && (
                            <div className="mt-4 space-y-2">
                                <p className="text-xs text-gray-500 font-semibold px-2 uppercase tracking-wider">💡 Quick Questions:</p>
                                {quickQuestions[language].map((question, index) => (
                                    <button
                                        key={index}
                                        onClick={() => handleQuickQuestion(question)}
                                        className="w-full text-left text-sm px-4 py-3 bg-white border-2 border-gray-200 rounded-xl hover:border-pink-400 hover:bg-pink-50 transition-all duration-200 text-gray-700 font-medium hover:text-pink-700 transform hover:translate-x-1"
                                    >
                                        ➤ {question}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Input Area - Professional Footer */}
                    <div className="p-5 bg-gradient-to-t from-white to-gray-50 border-t-2 border-gray-100">
                        <form onSubmit={handleSendMessage} className="flex gap-3">
                            <input
                                ref={inputRef}
                                type="text"
                                value={inputMessage}
                                onChange={(e) => setInputMessage(e.target.value)}
                                placeholder="Ask me anything..."
                                disabled={isTyping}
                                className="flex-1 px-5 py-3 border-2 border-gray-200 rounded-full focus:outline-none focus:border-pink-400 focus:ring-3 focus:ring-pink-200 disabled:bg-gray-50 disabled:cursor-not-allowed text-sm font-medium bg-white transition-all duration-200 placeholder-gray-400"
                            />
                            <button
                                type="submit"
                                disabled={!inputMessage.trim() || isTyping}
                                style={{ background: 'linear-gradient(90deg, #E6003E 0%, #691223 100%)' }}
                                className="text-white p-3 rounded-full hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-110 active:scale-95 font-bold border-2 border-white/20"
                                aria-label="Send message"
                            >
                                {isTyping ? (
                                    <Loader2 size={20} className="animate-spin" />
                                ) : (
                                    <Send size={20} />
                                )}
                            </button>
                        </form>
                        <p className="text-xs text-gray-400 mt-3 text-center font-medium">
                            ⚠️ AI responses may not always be accurate. Verify important details.
                        </p>
                    </div>
                </div>
            )}
        </>
    );
};

export default Chatbot;
