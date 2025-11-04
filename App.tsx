import React, { useState, useCallback, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { AvailabilityGrid } from './components/AvailabilityGrid';
import { UserPlusIcon, TrashIcon, UsersIcon, ClockIcon, CloseIcon, SparklesIcon, TrophyIcon, LinkIcon, PlusCircleIcon } from './components/icons';
import type { TimeSlot, Member, SuggestedSlot } from './types';
import { FULL_DAYS_OF_WEEK, DEADLINE_TIMES } from './constants';


const App: React.FC = () => {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentName, setCurrentName] = useState<string>('');
  const [currentAvailability, setCurrentAvailability] = useState<TimeSlot[]>([]);
  const [error, setError] = useState<string>('');
  
  const [deadlineDay, setDeadlineDay] = useState<string>('Fri');
  const [deadlineTime, setDeadlineTime] = useState<string>('17:00');
  const [reminder, setReminder] = useState<{ show: boolean; message: string; } | null>(null);

  const [isSuggesting, setIsSuggesting] = useState<boolean>(false);
  const [suggestion, setSuggestion] = useState<SuggestedSlot[] | null>(null);
  const [suggestionError, setSuggestionError] = useState<string>('');
  
  const [shareLink, setShareLink] = useState<string>('');
  const [copyButtonText, setCopyButtonText] = useState('Copy');


  // Effect to load state from URL on initial render
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const currentTeamId = urlParams.get('teamId');
    if (currentTeamId) {
        setTeamId(currentTeamId);
        const data = urlParams.get('data');
        if (data) {
          try {
            const decodedData = JSON.parse(atob(data));
            if (decodedData.members && Array.isArray(decodedData.members)) {
              setMembers(decodedData.members);
            }
            if (decodedData.deadlineDay && typeof decodedData.deadlineDay === 'string') {
              setDeadlineDay(decodedData.deadlineDay);
            }
            if (decodedData.deadlineTime && typeof decodedData.deadlineTime === 'string') {
              setDeadlineTime(decodedData.deadlineTime);
            }
          } catch (e) {
            console.error("Failed to parse shared data from URL", e);
          }
        }
    }
  }, []);

  useEffect(() => {
    const calculateAndSetReminder = () => {
        const hasSubmitted = sessionStorage.getItem(`availabilitySubmitted-${teamId}`) === 'true';
        if (hasSubmitted) {
            if(reminder) setReminder(null);
            return;
        }

        const dayMap: { [key: string]: number } = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
        const targetDay = dayMap[deadlineDay];
        const [targetHour, targetMinute] = deadlineTime.split(':').map(Number);

        let deadlineDate = new Date();
        const currentDay = deadlineDate.getDay();
        const daysUntil = (targetDay - currentDay + 7) % 7;
        
        const deadlineHasPassedToday = deadlineDate.getHours() > targetHour || 
                                      (deadlineDate.getHours() === targetHour && deadlineDate.getMinutes() > targetMinute);

        if (daysUntil === 0 && deadlineHasPassedToday) {
             deadlineDate.setDate(deadlineDate.getDate() + 7);
        } else {
             deadlineDate.setDate(deadlineDate.getDate() + daysUntil);
        }
       
        deadlineDate.setHours(targetHour, targetMinute, 0, 0);

        const now = new Date();
        const hoursUntil = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60);

        if (hoursUntil > 0 && hoursUntil <= 24) {
            const friendlyDeadline = deadlineDate.toLocaleDateString(undefined, { weekday: 'long', hour: 'numeric', minute: 'numeric' });
            setReminder({
                show: true,
                message: `Reminder: The deadline to submit your availability is ${friendlyDeadline}.`,
            });
        } else {
            if(reminder) setReminder(null);
        }
    };

    if (teamId) {
        calculateAndSetReminder();
        const interval = setInterval(calculateAndSetReminder, 60 * 1000); // Check every minute
        return () => clearInterval(interval);
    }
  }, [deadlineDay, deadlineTime, reminder, teamId]);

  const handleSlotToggle = useCallback((slot: TimeSlot) => {
    setCurrentAvailability(prev => {
      const isSelected = prev.some(s => s.day === slot.day && s.time === slot.time);
      if (isSelected) {
        return prev.filter(s => !(s.day === slot.day && s.time === slot.time));
      } else {
        return [...prev, slot];
      }
    });
  }, []);

  const handleAddMember = useCallback(() => {
    if (!currentName.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (members.some(m => m.name.toLowerCase() === currentName.trim().toLowerCase())) {
        setError('This name has already been added. Please use a different name.');
        return;
    }
    if (currentAvailability.length === 0) {
      setError('Please select at least one available time slot.');
      return;
    }

    const newMember: Member = {
      id: new Date().toISOString(),
      name: currentName.trim(),
      availability: currentAvailability,
    };

    setMembers(prev => [...prev, newMember]);
    setSuggestion(null);
    setShareLink('');
    sessionStorage.setItem(`availabilitySubmitted-${teamId}`, 'true');
    setReminder(null);
    setCurrentName('');
    setCurrentAvailability([]);
    setError('');
  }, [currentName, currentAvailability, members, teamId]);
  
  const handleClearSelection = useCallback(() => {
      setCurrentAvailability([]);
  }, []);

  const handleRemoveMember = useCallback((id: string) => {
    setMembers(prev => {
        const newMembers = prev.filter(m => m.id !== id);
        if (newMembers.length < 2) {
            setSuggestion(null);
        }
        setShareLink('');
        return newMembers;
    });
  }, []);

  const handleSuggestTime = useCallback(async () => {
    setIsSuggesting(true);
    setSuggestion(null);
    setSuggestionError('');

    const formattedAvailability = members
      .map(member => {
        const slots = member.availability
          .map(slot => `${slot.day} ${slot.time}`)
          .join(', ');
        return `${member.name}: ${slots}`;
      })
      .join('\n');

    const prompt = `You are an expert meeting scheduler. Based on the following team availability data, please suggest the best 3 one-hour time slots for a meeting. Prioritize slots with the maximum number of attendees. Here is the availability data for each team member:\n\n${formattedAvailability}\n\nReturn the result as a JSON array of objects, where each object represents a suggested slot and includes the day, the start time, and a list of attendees who are available for that full hour.`;

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            day: { type: Type.STRING },
                            time: { type: Type.STRING },
                            attendees: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING }
                            }
                        },
                        required: ["day", "time", "attendees"]
                    }
                }
            }
        });
        
        const responseText = response.text.trim();
        const suggestedSlots = JSON.parse(responseText);
        setSuggestion(suggestedSlots);

    } catch (e) {
        console.error(e);
        setSuggestionError('Sorry, I couldn\'t find a suggestion. Please try again.');
    } finally {
        setIsSuggesting(false);
    }
  }, [members]);

  const handleGenerateShareLink = useCallback(() => {
    const stateToShare = { members, deadlineDay, deadlineTime };
    const base64Data = btoa(JSON.stringify(stateToShare));
    const newUrl = `${window.location.origin}${window.location.pathname}?teamId=${teamId}&data=${base64Data}`;
    setShareLink(newUrl);
    setCopyButtonText('Copy');
  }, [members, deadlineDay, deadlineTime, teamId]);

  const handleCopyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopyButtonText('Copied!');
      setTimeout(() => setCopyButtonText('Copy'), 2000);
    });
  }, [shareLink]);
  
  const handleCreateNewTeam = useCallback(() => {
    const newTeamId = Date.now().toString(36) + Math.random().toString(36).substring(2);
    setTeamId(newTeamId);
    setMembers([]);
    setCurrentName('');
    setCurrentAvailability([]);
    setError('');
    setSuggestion(null);
    setSuggestionError('');
    setReminder(null);
    setShareLink('');
    const newUrl = `${window.location.origin}${window.location.pathname}?teamId=${newTeamId}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
  }, []);

  const ColorLegend = () => (
    <div className="mt-4 p-4 bg-white rounded-lg shadow-md">
      <h3 className="text-lg font-semibold text-slate-700 mb-3">Legend</h3>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
        <div className="flex items-center"><div className="w-4 h-4 rounded-full bg-red-200 mr-2"></div> {'< 25%'}</div>
        <div className="flex items-center"><div className="w-4 h-4 rounded-full bg-orange-300 mr-2"></div> {'< 50%'}</div>
        <div className="flex items-center"><div className="w-4 h-4 rounded-full bg-yellow-300 mr-2"></div> {'< 75%'}</div>
        <div className="flex items-center"><div className="w-4 h-4 rounded-full bg-lime-400 mr-2"></div> {'< 100%'}</div>
        <div className="flex items-center"><div className="w-4 h-4 rounded-full bg-green-500 mr-2"></div> {'100% Match'}</div>
      </div>
    </div>
  );
  
  const SuggestionCard = () => (
    <div className="relative mt-6 bg-indigo-50 border border-indigo-200 p-6 rounded-xl shadow-lg">
        <button
            onClick={() => setSuggestion(null)}
            className="absolute top-3 right-3 p-1.5 rounded-full text-indigo-500 hover:bg-indigo-200 transition-colors"
            aria-label="Dismiss suggestion"
            >
            <CloseIcon />
        </button>

        <div className="flex items-center mb-4">
            <TrophyIcon />
            <h3 className="text-xl font-bold text-slate-800 ml-3">Top 3 Suggested Times</h3>
        </div>

        {isSuggesting && <p className="text-slate-600">Finding the best slots...</p>}
        {suggestionError && <p className="text-red-600">{suggestionError}</p>}
        {suggestion && suggestion.length > 0 && (
            <ul className="space-y-4">
                {suggestion.map((slot, index) => (
                    <li key={index} className="p-4 bg-white rounded-lg border border-slate-200">
                        <p className="font-bold text-indigo-700 text-lg">{slot.day}, {slot.time}</p>
                        <p className="text-sm text-slate-500 mt-1">
                            <span className="font-semibold">{slot.attendees.length}/{members.length}</span> attendees can make it: {slot.attendees.join(', ')}
                        </p>
                    </li>
                ))}
            </ul>
        )}
        {suggestion && suggestion.length === 0 && (
             <p className="text-slate-600">No overlapping one-hour time slots were found for the team.</p>
        )}
    </div>
  );
  
  if (!teamId) {
    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
            <div className="text-center max-w-lg mx-auto">
                 <header className="mb-8">
                    <h1 className="text-4xl md:text-5xl font-bold text-slate-900">Team Availability Planner</h1>
                    <p className="mt-2 text-lg text-slate-600">Find the perfect time to collaborate</p>
                </header>
                <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200">
                    <h2 className="text-2xl font-bold text-slate-800 mb-4">Welcome!</h2>
                    <p className="text-slate-600 mb-6">Create a new, isolated planner for your team to get started. Each planner gets a unique, sharable link.</p>
                    <button
                        onClick={handleCreateNewTeam}
                        className="w-full flex items-center justify-center px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-300"
                    >
                        <PlusCircleIcon />
                        Create New Team Planner
                    </button>
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-6">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900">Team Availability Planner</h1>
          <p className="mt-2 text-lg text-slate-600">Find the perfect time to collaborate</p>
        </header>

        {reminder?.show && (
          <div className="relative bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-4 rounded-r-lg shadow-md mb-6 flex items-center" role="alert">
            <ClockIcon />
            <p className="font-medium">{reminder.message}</p>
            <button
              onClick={() => setReminder(null)}
              className="absolute top-2 right-2 p-1.5 rounded-full text-yellow-600 hover:bg-yellow-200 transition-colors"
              aria-label="Dismiss reminder"
            >
              <CloseIcon />
            </button>
          </div>
        )}

        <section className="mb-8 bg-white/60 backdrop-blur-sm p-6 rounded-xl shadow-lg border border-slate-200">
            <h2 className="text-xl font-bold text-slate-800 mb-3">Set Weekly Deadline</h2>
            <div className="flex flex-col sm:flex-row gap-4 items-center">
                <p className="text-slate-600">Reminders appear 24 hours before:</p>
                <div className="flex gap-4">
                    <select value={deadlineDay} onChange={e => setDeadlineDay(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition">
                        {FULL_DAYS_OF_WEEK.map(day => <option key={day} value={day}>{day}</option>)}
                    </select>
                    <select value={deadlineTime} onChange={e => setDeadlineTime(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition">
                        {DEADLINE_TIMES.map(time => <option key={time} value={time}>{time}</option>)}
                    </select>
                </div>
            </div>
        </section>

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <section className="bg-white/60 backdrop-blur-sm p-6 rounded-xl shadow-lg border border-slate-200">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">1. Add Your Availability</h2>
            <div className="space-y-4">
              <input
                type="text"
                value={currentName}
                onChange={e => {
                  setCurrentName(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Enter your name"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              />
              <p className="text-sm text-slate-500">Click on the time slots below to mark your availability.</p>
              <AvailabilityGrid
                mode="input"
                selectedSlots={currentAvailability}
                onSlotClick={handleSlotToggle}
              />
              {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <button
                  onClick={handleAddMember}
                  className="w-full sm:w-auto flex-grow flex items-center justify-center px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-300"
                >
                  <UserPlusIcon />
                  Add to Team
                </button>
                <button
                  onClick={handleClearSelection}
                  className="w-full sm:w-auto flex items-center justify-center px-6 py-3 bg-slate-500 text-white font-semibold rounded-lg shadow-md hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition-colors duration-300"
                >
                  <TrashIcon />
                  Clear Selection
                </button>
              </div>
            </div>
          </section>

          {/* Display Section */}
          <section className="bg-white/60 backdrop-blur-sm p-6 rounded-xl shadow-lg border border-slate-200">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">2. View Team Availability</h2>
             {members.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center bg-slate-50 rounded-lg p-6">
                    <UsersIcon />
                    <p className="mt-4 text-slate-500">The team's combined schedule will appear here once members add their availability.</p>
                </div>
            ) : (
                <>
                    <div className="mb-4 p-4 bg-slate-50 rounded-lg">
                        <h3 className="text-lg font-semibold text-slate-700 mb-2">{members.length} Member(s) Submitted:</h3>
                        <ul className="space-y-2">
                           {members.map(member => (
                               <li key={member.id} className="flex justify-between items-center bg-white p-2 rounded-md shadow-sm">
                                   <span className="text-slate-600">{member.name}</span>
                                   <button onClick={() => handleRemoveMember(member.id)} className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                   </button>
                               </li>
                           ))}
                        </ul>
                    </div>

                    <div className="my-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <h3 className="text-lg font-semibold text-slate-700 mb-3">🚀 Deploy & Share</h3>
                        <p className="text-sm text-slate-500 mb-3">Generate a link to share the current plan with your team.</p>
                        <button
                            onClick={handleGenerateShareLink}
                            className="w-full flex items-center justify-center px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-300"
                        >
                            <LinkIcon />
                            Generate Sharable Link
                        </button>
                        {shareLink && (
                            <div className="mt-4 flex gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={shareLink}
                                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-slate-100 text-slate-600 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                                />
                                <button onClick={handleCopyToClipboard} className="px-4 py-1.5 bg-slate-500 text-white font-semibold rounded-lg hover:bg-slate-600 transition-colors text-sm w-24">
                                    {copyButtonText}
                                </button>
                            </div>
                        )}
                    </div>
                    
                    <button
                        onClick={handleSuggestTime}
                        disabled={isSuggesting || members.length < 2}
                        className="w-full flex items-center justify-center px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all duration-300 disabled:bg-slate-400 disabled:cursor-not-allowed"
                    >
                        <SparklesIcon />
                        {isSuggesting ? 'Thinking...' : 'Suggest Best Time'}
                    </button>
                    {members.length < 2 && <p className="text-xs text-center text-slate-500 mt-2">Add at least two members to get a suggestion.</p>}

                    {(isSuggesting || suggestion || suggestionError) && <SuggestionCard />}

                    <AvailabilityGrid
                        mode="display"
                        members={members}
                    />
                    <ColorLegend />
                </>
            )}
          </section>
        </main>
      </div>
    </div>
  );
};

export default App;