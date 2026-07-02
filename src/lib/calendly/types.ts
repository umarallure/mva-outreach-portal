export type CalendlyMeetingState =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "canceled"
  | "rescheduled"
  | "no_show";

export type CalendlyQuestionAnswerView = {
  question: string;
  answer: string;
};

export type CalendlyTrackingView = {
  utmCampaign: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  salesforceUuid: string | null;
};

export type CalendlyCancellationView = {
  canceledBy: string;
  reason: string | null;
  cancelerType: string;
  createdAt: string;
};

export type CalendlyMeetingView = {
  eventUri: string;
  eventUuid: string;
  inviteeUri: string | null;
  inviteeUuid: string | null;
  eventName: string;
  state: CalendlyMeetingState;
  eventStatus: string;
  inviteeStatus: string | null;
  startTime: string;
  endTime: string;
  inviteeName: string | null;
  inviteeEmail: string | null;
  timezone: string | null;
  locationLabel: string;
  questionsAndAnswers: CalendlyQuestionAnswerView[];
  tracking: CalendlyTrackingView;
  cancellation: CalendlyCancellationView | null;
  rescheduled: boolean;
  oldInviteeUri: string | null;
  newInviteeUri: string | null;
  noShowUri: string | null;
  noShowCreatedAt: string | null;
  eventTypeUri: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CalendlyWorkspaceSummary = {
  total: number;
  upcoming: number;
  today: number;
  completed: number;
  canceledOrRescheduled: number;
  noShow: number;
};

export type CalendlyWorkspaceHealth = {
  tokenConfigured: boolean;
  userUriConfigured: boolean;
  organizationUriConfigured: boolean;
  webhookSigningKeyConfigured: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastWebhookAt: string | null;
  lastWebhookEventName: string | null;
  setupRequired: boolean;
  errorMessage: string | null;
};

export type CalendlyWorkspaceView = {
  account: {
    id: string;
    label: string;
    href: string;
    userUri: string;
    organizationUri: string;
  };
  health: CalendlyWorkspaceHealth;
  summary: CalendlyWorkspaceSummary;
  meetings: CalendlyMeetingView[];
};
