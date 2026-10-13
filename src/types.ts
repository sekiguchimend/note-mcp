// Shared types for note-mcp.

export interface Selectors {
  urls: {
    base: string;
    login: string;
    newPost: string;
    search: string;
  };
  login: {
    emailInput: string;
    passwordInput: string;
    submitButton: string;
    loggedInMarker: string;
    codeChallengeMarker: string;
    codeInput: string;
    codeSubmitButton: string;
    recaptchaIframe: string;
    recaptchaSitekeyAttr: string;
    recaptchaWidget: string;
  };
  editor: {
    titleInput: string;
    bodyEditor: string;
    imageUploadButton: string;
    imageCropConfirmButton: string;
    proceedToPublishButton: string;
    hashtagInput: string;
    publishButton: string;
    saveDraftButton: string;
    publishedMarker: string;
  };
  search: {
    resultCard: string;
    likeButton: string;
    likedState: {
      ariaPressed: string;
      likedClassContains: string;
    };
    scrollStepPx: number;
  };
}

export interface PostJob {
  kind: "post";
  title: string;
  body: string; // Markdown
  tags: string[];
  publish: boolean;
  imageUrl?: string; // optional eyecatch/header image (downloaded then uploaded)
}

export interface LikeJob {
  kind: "like";
  keyword: string;
  count: number;
  skipIfLiked: boolean;
}

export type Job = PostJob | LikeJob;

export interface PostResult {
  kind: "post";
  ok: boolean;
  url?: string;
  published: boolean;
  message: string;
}

export interface LikeResult {
  kind: "like";
  ok: boolean;
  liked: number;
  skipped: number;
  keyword: string;
  message: string;
}

export type JobResult = PostResult | LikeResult;
