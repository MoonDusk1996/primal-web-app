import { nip19 } from "../lib/nTools";
import { createStore, reconcile } from "solid-js/store";
import { getFutureUserFeed, } from "../lib/feed";
import { convertToArticles, convertToNotes, sortByScore } from "../stores/note";
import { emptyPage, Kind } from "../constants";
import {
  batch,
  createContext,
  createEffect,
  JSXElement,
  onCleanup,
  useContext
} from "solid-js";
import {
  isConnected,
  readData,
  refreshSocketListeners,
  removeSocketListeners,
  socket,
  subsTo
} from "../sockets";
import {
  ContextChildren,
  FeedPage,
  NostrEOSE,
  NostrEvent,
  NostrEventContent,
  NostrEvents,
  NostrMentionContent,
  NostrNoteActionsContent,
  NostrNoteContent,
  NostrRelays,
  NostrStatsContent,
  NostrUserContent,
  NoteActions,
  PrimalArticle,
  PrimalNote,
  PrimalUser,
  PrimalZap,
  UserStats,
  VanityProfiles,
} from "../types/primal";
import { APP_ID } from "../App";
import { hexToNpub } from "../lib/keys";
import {
  extractRelayConfigFromTags,
  getCommonFollowers,
  getProfileContactList,
  getProfileFollowerList,
  getProfileScoredNotes,
  getRelays,
  getUserProfileInfo,
  isUserFollowing,
} from "../lib/profile";
import { useAccountContext } from "./AccountContext";
import { readRecomendedUsers, saveRecomendedUsers } from "../lib/localStore";
import { fetchUserZaps } from "../handleFeeds";
import { convertToUser } from "../stores/profile";
import ProfileAbout from "../components/ProfileAbout/ProfileAbout";
import { emptyPaging, fetchMegaFeed, MegaFeedResults, PaginationInfo } from "../megaFeeds";

let startTime = 0;
let midTime = 0;
let endTime = 0

export type ProfileContextStore = {
  profileKey: string | undefined,
  userProfile: PrimalUser | undefined,
  userStats: UserStats,
  fetchedUserStats: boolean,
  knownProfiles: VanityProfiles,
  articles: PrimalArticle[],
  notes: PrimalNote[],
  replies: PrimalNote[],
  zaps: PrimalZap[],
  zappedNotes: PrimalNote[],
  zappedArticles: PrimalArticle[],
  gallery: PrimalNote[],
  zapListOffset: number,
  lastZap: PrimalZap | undefined,
  commonFollowers: PrimalUser[],
  paging: Record<string, PaginationInfo>,
  future: {
    notes: PrimalNote[],
    articles: PrimalArticle[],
    page: FeedPage,
    replies: PrimalNote[],
    repliesPage: FeedPage,
    reposts: Record<string, string> | undefined,
  },
  contactListDate: number,
  isProfileFollowing: boolean,
  isFetching: boolean,
  isFetchingSidebarNotes: boolean,
  isProfileFetched: boolean,
  isFetchingReplies: boolean,
  isFetchingGallery: boolean,
  fetchingProfileForKey: string,
  page: FeedPage,
  repliesPage: FeedPage,
  reposts: Record<string, string> | undefined,
  lastNote: PrimalNote | undefined,
  lastArticle: PrimalArticle | undefined,
  lastReply: PrimalNote | undefined,
  lastGallery: PrimalNote | undefined,
  following: string[],
  sidebarNotes: FeedPage & { notes: PrimalNote[] },
  sidebarArticles: FeedPage & { notes: PrimalArticle[] },
  isFetchingSidebarArticles: boolean,
  filterReason: { action: 'block' | 'allow', pubkey?: string, group?: string } | null,
  contacts: PrimalUser[],
  followers: PrimalUser[],
  zappers: Record<string, PrimalUser>,
  isFetchingContacts: boolean,
  isFetchingFollowers: boolean,
  isFetchingZaps: boolean,
  isFetchingRelays: boolean,
  isAboutParsed: boolean,
  profileStats: Record<string, number>,
  relays: NostrRelays,
  profileHistory: {
    profiles: PrimalUser[],
    stats: Record<string, UserStats>,
  },
  parsedAbout: JSXElement | undefined,
  actions: {
    clearNotes: () => void,
    clearReplies: () => void,
    clearZaps: () => void,
    clearArticles: () => void,
    clearGallery: () => void,
    setProfileKey: (profileKey?: string) => void,
    refreshNotes: () => void,
    checkForNewNotes: (pubkey: string | undefined) => void,
    fetchContactList: (pubkey: string | undefined, extended?: boolean) => void,
    fetchFollowerList: (pubkey: string | undefined) => void,
    fetchRelayList: (pubkey: string | undefined) => void,
    clearContacts: () => void,
    clearFilterReason: () => void,
    removeContact: (pubkey: string) => void,
    addContact: (pubkey: string, source: PrimalUser[]) => void,
    fetchZapList: (pubkey: string | undefined) => void,
    fetchNextZapsPage: () => void,
    resetProfile: () => void,
    getProfileMegaFeed: (pubkey: string | undefined, tab: string, until?: number, limit?: number) => void,
    getProfileMegaFeedNextPage: (pubkey: string | undefined, tab: string) => void,
    addProfileToHistory: (user: PrimalUser) => void,
  }
}

export const emptyStats = {
  pubkey: '',
  follows_count: 0,
  followers_count: 0,
  note_count: 0,
  reply_count: 0,
  time_joined: 0,
  total_zap_count: 0,
  total_satszapped: 0,
  relay_count: 0,
  media_count: 0,
};

export const initialData = {
  profileKey: undefined,
  userProfile: undefined,
  userStats: { ...emptyStats },
  fetchedUserStats: false,
  knownProfiles: { names: {} },
  articles: [],
  notes: [],
  replies: [],
  gallery: [],
  contactListDate: 0,
  isFetching: false,
  isProfileFetched: false,
  isFetchingReplies: false,
  isProfileFollowing: false,
  isFetchingZaps: false,
  isFetchingGallery: false,
  page: { messages: [], users: {}, postStats: {}, mentions: {}, noteActions: {}, topZaps: {} },
  repliesPage: { messages: [], users: {}, postStats: {}, mentions: {}, noteActions: {}, topZaps: {} },
  reposts: {},
  zaps: [],
  zappedNotes: [],
  zappedArticles: [],
  zappers: {},
  zapListOffset: 0,
  lastNote: undefined,
  lastArticle: undefined,
  lastReply: undefined,
  lastZap: undefined,
  lastGallery: undefined,
  following: [],
  filterReason: null,
  contacts: [],
  profileStats: {},
  isFetchingContacts: false,
  isFetchingSidebarNotes: false,
  followers: [],
  isFetchingFollowers: false,
  relays: {},
  isFetchingRelays: false,
  fetchingProfileForKey: '',
  isAboutParsed: false,
  commonFollowers: [],
  sidebarNotes: {
    messages: [],
    users: {},
    postStats: {},
    notes: [],
    topZaps: {},
    noteActions: {},
  },
  sidebarArticles: {
    messages: [],
    users: {},
    postStats: {},
    notes: [],
    topZaps: {},
    noteActions: {},
  },
  isFetchingSidebarArticles: false,
  future: {
    notes: [],
    articles: [],
    replies: [],
    reposts: {},
    page: {
      messages: [],
      users: {},
      postStats: {},
      mentions: {},
      noteActions: {},
      topZaps: {},
    },
    repliesPage: {
      messages: [],
      users: {},
      postStats: {},
      mentions: {},
      noteActions: {},
      topZaps: {},
    },
  },
  profileHistory: {
    profiles: [],
    stats: {},
  },
  parsedAbout: undefined,
  paging: {
    notes: { ...emptyPaging() },
    reads: { ...emptyPaging() },
    gallery: { ...emptyPaging() },
    replies: { ...emptyPaging() },
  },
};

export const ProfileContext = createContext<ProfileContextStore>();

export const ProfileProvider = (props: { children: ContextChildren }) => {

  const account = useAccountContext();

  let commonFollowers: PrimalUser[] = [];

// ACTIONS --------------------------------------

  const getProfileMegaFeed = async (pubkey: string | undefined, tab: string, until = 0, limit = 20, offset = 0) => {
    if (!pubkey) return;

    if (tab === 'notes') {
      const specification = {
        id: 'feed',
        kind:'notes',
        notes: 'authored',
        pubkey,
      };

      updateStore('isFetching', () => true);

      const { notes, paging } = await fetchMegaFeed(
        account?.publicKey,
        JSON.stringify(specification),
        `profile_notes_${APP_ID}`,
        {
          limit,
          until,
          offset: offset || store.notes.map(n => n.repost ? n.repost.note.created_at : (n.post.created_at || 0)),
        },
      );

      updateStore('paging', 'notes', () => ({ ...paging }));
      updateStore('notes', (ns) => [ ...ns, ...notes]);
      updateStore('isFetching', () => false);
      return;
    }

    if (tab === 'replies') {
      const specification = {
        id: 'feed',
        kind:'notes',
        notes: 'replies',
        pubkey,
      };

      updateStore('isFetchingReplies', () => true);

      const { notes, paging } = await fetchMegaFeed(
        account?.publicKey,
        JSON.stringify(specification),
        `profile_replies_${APP_ID}`,
        {
          limit,
          until,
          offset: offset || store.replies.map(n => n.repost ? n.repost.note.created_at : (n.post.created_at || 0)),
        },
      );

      updateStore('paging', 'replies', () => ({ ...paging }));
      updateStore('replies', (ns) => [ ...ns, ...notes]);
      updateStore('isFetchingReplies', () => false);
      return;
    }

    if (tab === 'reads') {
      const specification = {
        id: 'feed',
        kind:'reads',
        notes: 'authored',
        pubkey,
      };

      updateStore('isFetching', () => true);

      const { reads, paging } = await fetchMegaFeed(
        account?.publicKey,
        JSON.stringify(specification),
        `profile_reads_${APP_ID}`,
        {
          limit,
          until,
          offset: offset || store.articles.map(n => n.published || 0),
        },
      );

      updateStore('paging', 'reads', () => ({ ...paging }));
      updateStore('articles', (ns) => [ ...ns, ...reads]);
      updateStore('isFetching', () => false);
      return;
    }

    if (tab === 'media') {
      const specification = {
        id: 'feed',
        kind:'notes',
        notes: 'user_media_thumbnails',
        pubkey,
      };

      updateStore('isFetchingGallery', () => true);

      const { notes, paging } = await fetchMegaFeed(
        account?.publicKey,
        JSON.stringify(specification),
        `profile_media_${APP_ID}`,
        {
          limit,
          until,
          offset: offset || store.gallery.map(n => n.repost ? n.repost.note.created_at : (n.post.created_at || 0)),
        },
      );

      updateStore('paging', 'media', () => ({ ...paging }));
      updateStore('gallery', (ns) => [ ...ns, ...notes]);
      updateStore('isFetchingGallery', () => false);
      return;
    }
  }
  const getProfileMegaFeedNextPage = async (pubkey: string | undefined, tab: string) => {
    if (!pubkey) return;

    const paging = store.paging[tab] || { until: 0, since: 0, sortBy: 'created_at'};

    getProfileMegaFeed(pubkey, tab, paging.since, 20);
  }

  const fetchZapList = async (pubkey: string | undefined, until = 0, offset = 0, indicateFetching = true) => {
    if (!pubkey) return;
    const subIdProfiles = `profile_zaps_${APP_ID}`;

    updateStore('isFetchingZaps', () => true);

    const { zaps, notes, articles } = await fetchUserZaps(pubkey, subIdProfiles, until, offset, 20);

    updateStore('zaps', (zs) => [ ...zs, ...zaps ]);
    updateStore('zappedNotes', (zn) => [ ...zn,  ...notes ]);
    updateStore('zappedArticles', (za) => [ ...za, ...articles ]);

    updateStore('isFetchingZaps', () => false);
  };

  const fetchNextZapsPage = () => {
    const lastZap = store.zaps[store.zaps.length - 1];

    if (!lastZap) {
      return;
    }

    // const lastAmount = lastZap.amount;

    // const offset = store.zaps.reduce((acc, zap) =>
    //   zap.amount === lastAmount ? acc+1 : acc,
    //   0,
    // );
    // const until = lastZap.amount || 0;

    updateStore('lastZap', () => ({ ...lastZap }));

    const until = lastZap.created_at || 0;

    if (until > 0 && store.profileKey) {
      fetchZapList(store.profileKey, until, 0, false);
    }
  };

  const addContact = (pubkey: string, source: PrimalUser[]) => {
    const newContact = source.find(c => c.pubkey === pubkey);

    newContact && updateStore('contacts', store.contacts.length, reconcile(newContact));
  };

  const removeContact = (pubkey: string) => {
    const newContacts = store.contacts.filter(c => c.pubkey !== pubkey);

    updateStore('contacts', reconcile(newContacts));

  };

  const fetchContactList = (pubkey: string | undefined, extended = true) => {
    if (!pubkey) return;

    updateStore('isFetchingContacts', () => true);

    const subIdContacts = `profile_contacts_${APP_ID}`;

    const unsubContacts = subsTo(subIdContacts, {
      onEvent: (_, content) => {
        if (content?.kind === Kind.Contacts) {
          updateStore('contactListDate', () => content.created_at || 0);
        }

        if (content?.kind === Kind.Metadata) {
          let user = JSON.parse(content.content);

          if (!user.displayName || typeof user.displayName === 'string' && user.displayName.trim().length === 0) {
            user.displayName = user.display_name;
          }
          user.pubkey = content.pubkey;
          user.npub = hexToNpub(content.pubkey);
          user.created_at = content.created_at;

          updateStore('contacts', store.contacts.length, () => ({ ...user }));
          return;
        }

        if (content?.kind === Kind.UserFollowerCounts) {
          const stats = JSON.parse(content.content);

          updateStore('profileStats', () => ({ ...stats }));
          return;
        }
      },
      onEose: () => {
        updateStore('isFetchingContacts', () => false);
        unsubContacts();
      },
    });

    getProfileContactList(pubkey, subIdContacts, extended);
  };

  const fetchRelayList = (pubkey: string | undefined) => {
    if (!pubkey) return;

    const subIdRelays = `profile_relays_${APP_ID}`;

    const unsubContacts = subsTo(subIdRelays, {
      onEvent: (_, content) => {
        if (content?.kind === Kind.UserRelays) {
          const relays = extractRelayConfigFromTags(content.tags);

          updateStore('relays', reconcile(relays));
          return;
        }
      },
      onEose: () => {
        updateStore('isFetchingRelays', () => false);
        unsubContacts();
      },
    });

    updateStore('isFetchingRelays', () => true);

    getRelays(pubkey, subIdRelays);
  };

  const fetchFollowerList = (pubkey: string | undefined) => {
    if (!pubkey) return;
    const subIdProfiles = `profile_followers_${APP_ID}`;

    const unsubProfiles = subsTo(subIdProfiles, {
      onEvent: (_, content) => {
        if (content?.kind === Kind.Metadata) {
          let user = JSON.parse(content.content);

          if (!user.displayName || typeof user.displayName === 'string' && user.displayName.trim().length === 0) {
            user.displayName = user.display_name;
          }
          user.pubkey = content.pubkey;
          user.npub = hexToNpub(content.pubkey);
          user.created_at = content.created_at;

          updateStore('followers', store.followers.length, () => ({ ...user }));
        }

        if (content?.kind === Kind.UserFollowerCounts) {
          const stats: Record<string, number> = JSON.parse(content.content);

          updateStore('profileStats', () => ({ ...stats }));
        }
      },
      onEose: () => {
        updateStore('isFetchingFollowers', () => false);
        unsubProfiles();
      },
    });

    updateStore('isFetchingFollowers', () => true);

    getProfileFollowerList(pubkey, subIdProfiles);
  };

  const clearGallery = () => {
    updateStore('gallery', () => []);
    updateStore('lastGallery', () => undefined);
  };

  const clearNotes = () => {
    updateStore('page', () => ({ messages: [], users: {}, postStats: {}, noteActions: {} }));
    updateStore('notes', () => []);
    updateStore('reposts', () => undefined);
    updateStore('lastNote', () => undefined);
    updateStore('sidebarNotes', () => ({
      messages: [],
      users: {},
      postStats: {},
      notes: [],
      noteActions: {},
    }));
    updateStore('sidebarArticles', () => ({
      messages: [],
      users: {},
      postStats: {},
      notes: [],
      noteActions: {},
    }));
  };

  const clearArticles = () => {
    updateStore('articles', () => []);
    updateStore('lastArticle', () => undefined);
  };

  const clearReplies = () => {
    updateStore('repliesPage', () => ({ messages: [], users: {}, postStats: {}, noteActions: {} }));
    updateStore('replies', () => []);
    updateStore('lastReply', () => undefined);
  };

  const clearZaps = () => {
    updateStore('zaps', () => []);
    updateStore('zappers', reconcile({}));
    updateStore('lastZap', () => undefined);
  };

  const clearContacts = () => {
    updateStore('contacts', () => []);
    updateStore('followers', () => []);
    // @ts-ignore
    updateStore('profileStats', () => undefined);
    updateStore('profileStats', () => ({}));
  };

  const clearFilterReason = () => {
    updateStore('filterReason', () => null);
  };

  const clearFuture = () => {
    updateStore('future', () => ({
      notes: [],
      replies: [],
      reposts: {},
      page: {
        messages: [],
        users: {},
        postStats: {},
        mentions: {},
        noteActions: {},
        topZaps: {},
      },
      repliesPage: {
        messages: [],
        users: {},
        postStats: {},
        mentions: {},
        noteActions: {},
        topZaps: {},
      },
    }))
  }

  const checkForNewNotes = (pubkey: string | undefined) => {

    if (store.future.notes.length > 100) {
      return;
    }

    let since = 0;

    if (store.notes[0]) {
      since = store.notes[0].repost ?
        store.notes[0].repost.note.created_at :
        store.notes[0].post.created_at;
    }

    clearFuture();

    getFutureUserFeed(
      account?.publicKey,
      pubkey,
      `profile_future_${APP_ID}`,
      since,
    );
  }

  const loadFutureContent = () => {
    if (store.future.notes.length === 0) {
      return;
    }

    updateStore('notes', (notes) => [...store.future.notes, ...notes]);
    clearFuture();
  };


  const updateSidebar = (content: NostrEventContent, scope: 'sidebarNotes' | 'sidebarArticles' = 'sidebarNotes') => {
    if (content.kind === Kind.Metadata) {
      const user = content as NostrUserContent;

      updateStore(scope, 'users', () => ({ [user.pubkey]: user })
      );
      return;
    }

    if ([Kind.Text, Kind.Repost, Kind.LongForm].includes(content.kind)) {
      const message = content as NostrNoteContent;

      if (store.lastNote?.post?.noteId !== nip19.noteEncode(message.id)) {
        updateStore(scope, 'messages', (msgs) => [ ...msgs, message ]);
      }

      return;
    }

    if (content.kind === Kind.NoteStats) {
      const statistic = content as NostrStatsContent;
      const stat = JSON.parse(statistic.content);

      updateStore(scope, 'postStats', () => ({ [stat.event_id]: stat }));
      return;
    }

    if (content.kind === Kind.Mentions) {
      const mentionContent = content as NostrMentionContent;
      const mention = JSON.parse(mentionContent.content);

      updateStore('page', 'mentions', () => ({ [mention.id]: mention }));
      return;
    }

    if (content.kind === Kind.NoteActions) {
      const noteActionContent = content as NostrNoteActionsContent;
      const noteActions = JSON.parse(noteActionContent.content) as NoteActions;

      updateStore('page', 'noteActions', () => ({ [noteActions.event_id]: noteActions }));
      return;
    }
  };

  const saveSidebar = (page: FeedPage, scope: 'sidebarNotes' | 'sidebarArticles' = 'sidebarNotes') => {

    if (scope === 'sidebarNotes') {
     const newPosts = sortByScore(convertToNotes(page));
      updateStore(scope, 'notes', () => [ ...newPosts ]);
    }

    if (scope === 'sidebarArticles') {
      const newPosts = convertToArticles(page);
      updateStore(scope, 'notes', () => [ ...newPosts ]);
    }

  };



  const updateCommonFollowers = (content: NostrEventContent, scope: 'sidebarNotes' | 'sidebarArticles' = 'sidebarNotes') => {
    if (content.kind === Kind.Metadata) {
      const user = content as NostrUserContent;

      if (user.pubkey === store.profileKey) return;

      commonFollowers.push(convertToUser(user, content.pubkey));
      return;
    }
  };

  const saveCommonFollowers = () => {
    updateStore('commonFollowers', () => [ ...commonFollowers ]);
    commonFollowers = [];
  };

  const setProfileKey = async (profileKey?: string) => {
    updateStore('profileKey', () => profileKey);

    if (profileKey) {
      batch(() => {
        updateStore('sidebarNotes', () => ({ ...emptyPage }));
        updateStore('sidebarArticles', () => ({ ...emptyPage }));
        updateStore('parsedAbout', () => undefined);
        updateStore('filterReason', () => null);
        updateStore('userProfile', () => undefined);
        updateStore('userStats', () => ({ ...emptyStats }));
        updateStore('fetchedUserStats', () => false);
        updateStore('isProfileFetched', () => false);
        updateStore('isFetchingSidebarNotes', () => true);
        updateStore('isFetchingSidebarArticles', () => true);
        updateStore('isAboutParsed', () => false);
        updateStore('commonFollowers', () => []);
      })

      getUserProfileInfo(profileKey, account?.publicKey, `profile_info_${APP_ID}`);
      getProfileScoredNotes(profileKey, account?.publicKey, `profile_scored_${APP_ID}`, 8);
      getCommonFollowers(profileKey, account?.publicKey, `profile_cf_${APP_ID}`, 6);


      const readsSidebarSpec = {
        id: 'feed',
        kind:'reads',
        notes: 'authored',
        pubkey: profileKey,
      };

      const { reads } = await fetchMegaFeed(account?.publicKey, JSON.stringify(readsSidebarSpec), `profile_reads_latest_${APP_ID}`, { until: 0, limit: 2 });

      updateStore('sidebarArticles', () => ({ notes: [...reads ]}))
      updateStore('isFetchingSidebarArticles', () => false);

      isUserFollowing(profileKey, account?.publicKey, `is_profile_following_${APP_ID}`);
    }
  }

  const resetProfile = () => {
    updateStore('sidebarNotes', () => ({ ...emptyPage }));
    updateStore('sidebarArticles', () => ({ ...emptyPage }));
    updateStore('isProfileFetched', () => false);
    // updateStore('profileKey', () => undefined);
    updateStore('userProfile', () => undefined);
    updateStore('isFetching', () => false);
    updateStore('commonFollowers', () => []);
    updateStore('userStats', reconcile(emptyStats));
  };

  const refreshNotes = () => {
  };

  const addProfileToHistory = (user: PrimalUser) => {
    let list = [...store.profileHistory.profiles];

    const index = list.findIndex(u => u.pubkey === user.pubkey)

    // user is first in the list so the job is done
    if (index === 0) return;

    if (index > 0) {
      list.splice(index, 1);

      updateStore('profileHistory', 'profiles', () => [user, ...list]);

      return;
    }

    list.unshift(user);

    if (list.length > 10) {
      const last = list[list.length - 1].pubkey;

      let stats = { ...store.profileHistory.stats };

      delete stats[last];

      updateStore('profileHistory', 'stats', reconcile(stats));

      list.pop()
    }

    updateStore('profileHistory', 'profiles', () => [...list]);
  };

  const addStatsToHistory = (stats: UserStats) => {
    updateStore('profileHistory', 'stats', () => ({ [stats.pubkey]: stats }));
  };

// SOCKET HANDLERS ------------------------------

  const handleProfileInfoEvent = (content: NostrEventContent) => {
    if (content?.kind === Kind.FilteringReason) {
      const reason:  { action: 'block' | 'allow', pubkey?: string, group?: string } | null =
        JSON.parse(content.content) || null;

      if (reason?.action === 'block') {
        updateStore('filterReason', () => ({ ...reason }));
      } else {
        updateStore('filterReason', () => null);
      }
    }

    if (content?.kind === Kind.Metadata) {
      let user = JSON.parse(content.content);

      if (!user.displayName || typeof user.displayName === 'string' && user.displayName.trim().length === 0) {
        user.displayName = user.display_name;
      }
      user.pubkey = content.pubkey;
      user.npub = hexToNpub(content.pubkey);
      user.created_at = content.created_at;

      updateStore('userProfile', () => ({ ...user }));
      addProfileToHistory(user);
      return;
    }

    if (content?.kind === Kind.UserStats) {
      const stats = JSON.parse(content.content);

      updateStore('userStats', () => ({ ...stats }));
      addStatsToHistory(stats)
      updateStore('fetchedUserStats', () => true);
      return;
    }
  }

  const handleProfileInfoEose = () => {
    updateStore('isProfileFetched', () => true);
  }

  const handleProfileContectsEvent = (content: NostrEventContent) => {
    if (content && content.kind === Kind.Contacts) {
      const tags = content.tags;
      let contacts: string[] = [];

      for (let i = 0;i<tags.length;i++) {
        const tag = tags[i];
        if (tag[0] === 'p') {
          contacts.push(tag[1]);
        }
      }

      updateStore('following', () => contacts);
    }
  }

  const handleProfileFollowingEvent = (content: NostrEventContent) => {
    updateStore('isProfileFollowing', JSON.parse(content?.content || 'false'))
  }
  const handleProfileScoredEvent = (content: NostrEventContent) => {
    updateSidebar(content);
  }
  const handleProfileScoredEose = () => {
    saveSidebar(store.sidebarNotes);
    updateStore('isFetchingSidebarNotes', () => false);
  }
  const handleProfileCommonFollowersEvent = (content: NostrEventContent) => {
    updateCommonFollowers(content);
  }
  const handleProfileCommonFollowersEose = () => {
    saveCommonFollowers();
  }

  const onMessage = async (event: MessageEvent) => {
    const data = await readData(event);
    const message: NostrEvent | NostrEOSE | NostrEvents = JSON.parse(data);

    const [type, subId, content] = message;


    if (subId === `profile_info_${APP_ID}`) {
      if (type === 'EVENTS') {
        for (let i=0;i<content.length;i++) {
          const e = content[i];
          handleProfileInfoEvent(e);
        }

        handleProfileInfoEose();
      }

      if (type === 'EOSE') {
        handleProfileInfoEose()
        return;
      }

      if (type === 'EVENT') {
        handleProfileInfoEvent(content);
      }
    }

    if (subId === `profile_contacts_${APP_ID}`) {
      if (type === 'EVENTS') {
        for (let i=0;i<content.length;i++) {
          const e = content[i];
          handleProfileContectsEvent(e);
        }
      }
      if (type === 'EVENT') {
        handleProfileContectsEvent(content);
      }
      return;
    }

    if (subId === `is_profile_following_${APP_ID}`) {
      if (type === 'EVENTS') {
        for (let i=0;i<content.length;i++) {
          const e = content[i];
          handleProfileFollowingEvent(e);
        }
      }
      if (type === 'EVENT') {
        handleProfileFollowingEvent(content)
        return;
      }
    }

    if (subId === `profile_scored_${APP_ID}`) {
      if (type === 'EVENTS') {
        for (let i=0;i<content.length;i++) {
          const e = content[i];
          handleProfileScoredEvent(e);
        }

        handleProfileScoredEose();
      }
      if (type === 'EOSE') {
        handleProfileScoredEose();
        return;
      }

      if (type === 'EVENT') {
        handleProfileScoredEvent(content)
        return;
      }
    }

    if (subId === `profile_cf_${APP_ID}`) {
      if (type === 'EVENTS') {
        for (let i=0;i<content.length;i++) {
          const e = content[i];
          handleProfileCommonFollowersEvent(e);
        }

        handleProfileCommonFollowersEose();
      }
      if (type === 'EOSE') {
        handleProfileCommonFollowersEose();
        return;
      }

      if (type === 'EVENT') {
        handleProfileCommonFollowersEvent(content);
        return;
      }
    }
  };

  const onSocketClose = (closeEvent: CloseEvent) => {
    const webSocket = closeEvent.target as WebSocket;

    removeSocketListeners(
      webSocket,
      { message: onMessage, close: onSocketClose },
    );
  };


// EFFECTS --------------------------------------

  createEffect(() => {
    if (isConnected()) {
      refreshSocketListeners(
        socket(),
        { message: onMessage, close: onSocketClose },
      );
    }
  });

  createEffect(() => {
    if (account && account.hasPublicKey()) {
      const history = readRecomendedUsers(account.publicKey);

      history && updateStore('profileHistory', reconcile(history));
    }
  });

  createEffect(() => {
    const profiles = [...store.profileHistory.profiles];
    const stats = { ...store.profileHistory.stats };

    saveRecomendedUsers(account?.publicKey, { profiles, stats });
  });

  onCleanup(() => {
    removeSocketListeners(
      socket(),
      { message: onMessage, close: onSocketClose },
    );
  });

  createEffect(() => {
    if (store.isProfileFetched) {
      const parsed = parseAbout(store.userProfile?.about || '');

      updateStore('parsedAbout', () => parsed);
    }
  })

  const parseAbout = (about: string) => {
    if (about.length === 0) {
      updateStore('isAboutParsed', () => true);
      return <></>;
    }
    return <ProfileAbout about={about} onParseComplete={() => updateStore('isAboutParsed', () => true)} />
  }

// STORES ---------------------------------------


  const [store, updateStore] = createStore<ProfileContextStore>({
    ...initialData,
    actions: {
      clearNotes,
      clearArticles,
      clearGallery,
      clearReplies,
      setProfileKey,
      refreshNotes,
      checkForNewNotes,
      fetchContactList,
      fetchFollowerList,
      fetchRelayList,
      clearContacts,
      addContact,
      removeContact,
      fetchZapList,
      fetchNextZapsPage,
      clearZaps,
      resetProfile,
      clearFilterReason,
      addProfileToHistory,

      getProfileMegaFeed,
      getProfileMegaFeedNextPage,
    },
  });

// RENDER ---------------------------------------

  return (
    <ProfileContext.Provider value={store}>
      {props.children}
    </ProfileContext.Provider>
  );
}

export const useProfileContext = () => useContext(ProfileContext);
