import { Component, For, Show } from 'solid-js';
import {
  PrimalArticle,
  PrimalNote,
  PrimalUser
} from '../../types/primal';

import styles from './ProfileSidebar.module.scss';
import SmallNote from '../SmallNote/SmallNote';
import { useIntl } from '@cookbook/solid-intl';
import { userName } from '../../stores/profile';
import { profile as t } from '../../translations';
import { hookForDev } from '../../lib/devTools';
import ArticleShort from '../ArticlePreview/ArticleShort';


const ProfileSidebar: Component<{
  notes: PrimalNote[] | undefined,
  articles: PrimalArticle[] | undefined,
  profile: PrimalUser | undefined,
  id?: string,
}> = (props) => {

  const intl = useIntl();

  return (
    <div id={props.id}>
      <Show when={props.profile}>
        <div class={styles.headingTrending}>
          <div>
            {intl.formatMessage(t.sidebarCaptionReads)}
          </div>
        </div>

        <Show
          when={props.articles && props.articles.length > 0}
        >
          <div class={styles.articles}>
            <For each={props.articles}>
              {(article) => <ArticleShort article={article} shorter={true} />}
            </For>
          </div>
        </Show>

        <div class={styles.headingTrending}>
          <div>
            {intl.formatMessage(t.sidebarCaptionNotes)}
          </div>
        </div>

        <Show
          when={props.notes && props.notes.length > 0}
          fallback={
            <div class={styles.noNotes}>
              {intl.formatMessage(
                t.sidebarNoNotes,
                {
                  name: userName(props.profile),
                },
              )}
            </div>
          }
        >
          <For each={props.notes}>
            {(note) => <SmallNote note={note} />}
          </For>
        </Show>
      </Show>
    </div>
  );
}

export default hookForDev(ProfileSidebar);
