export interface NotificationSettingsRecord {
  medicationRenewal: {
    daysBeforeDue: number;
    enabled: boolean;
  };
  patientId: string;
  taskOverdue: {
    enabled: boolean;
  };
  telegramChatId: string;
  upcomingBooking: {
    daysBeforeDue: number;
    enabled: boolean;
  };
}

export interface UpdateNotificationSettingsPayload {
  medicationRenewal: {
    daysBeforeDue: number;
    enabled: boolean;
  };
  taskOverdue: {
    enabled: boolean;
  };
  telegramChatId: string;
  upcomingBooking: {
    daysBeforeDue: number;
    enabled: boolean;
  };
}
