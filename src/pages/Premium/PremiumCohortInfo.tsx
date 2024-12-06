import { Component, Match, Switch } from 'solid-js';

import styles from './Premium.module.scss';
import { useIntl } from '@cookbook/solid-intl';
import { A, useNavigate } from '@solidjs/router';
import { PremiumStore } from './Premium';
import Avatar from '../../components/Avatar/Avatar';
import VerificationCheck from '../../components/VerificationCheck/VerificationCheck';
import { shortDate } from '../../lib/dates';
import { userName } from '../../stores/profile';
import { PrimalUser } from '../../types/primal';
import { LegendCustomizationConfig } from '../../lib/premium';
import { CohortInfo } from '../../contexts/AppContext';


const PremiumCohortInfo: Component<{
  cohortInfo: CohortInfo,
  legendConfig?: LegendCustomizationConfig | undefined,
}> = (props) => {
  const intl = useIntl()
  const navigate = useNavigate();

  const destination = () => {
    if (props.cohortInfo.tier === 'premium') {
      return '/premium?og=1';
    }

    if (props.cohortInfo.tier === 'premium-legend') {
      return '/premium/legend?og=legend';
    }

    return '';
  }

  return (
    <A href={destination()} class={styles.premiumActive}>
      <div class={`${styles.legendPremium} ${styles[`legend_${props.legendConfig?.style}`]}`}>
        <div class={styles.caption}>{props.cohortInfo.cohort_1 || ''}</div>
        <div class={styles.date}>
          <div>{props.cohortInfo.cohort_2}</div>
        </div>
      </div>
    </A>
  );
}

export default PremiumCohortInfo;
