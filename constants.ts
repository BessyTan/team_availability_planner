export const DAYS_OF_WEEK: string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
export const TIME_SLOTS: string[] = [
  '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00'
];

export const FULL_DAYS_OF_WEEK: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DEADLINE_TIMES: string[] = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
