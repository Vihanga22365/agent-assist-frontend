export interface RunResponsePart {
  text?: string;
}

export interface RunResponse {
  content?: {
    parts?: RunResponsePart[];
    role?: string;
  };
  partial?: boolean;
}
