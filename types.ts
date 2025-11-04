export interface TimeSlot {
  day: string;
  time: string;
}

export interface Member {
  id: string;
  name: string;
  availability: TimeSlot[];
}

export interface SuggestedSlot {
  day: string;
  time: string;
  attendees: string[];
}
