import { authed, type Result } from './session';

/* ═══════════════════════════════════════════════════════════════════
   M8 client — real Nifty 500 companies, ranked by a price-based factor
   score. See backend/ml/salarypilot_ml/models/factors.py for exactly
   what is and is not being claimed.

   THE SHAPE IS DELIBERATELY LOOSE
   --------------------------------
   The server returns one of two shapes depending on whether the model's
   walk-forward evaluation beat the real Nifty 500 index:

     not enabled: { enabled: false, reason, evaluation? }
     enabled:     { enabled: true, model_version, as_of_date, data_source,
                     universe_size, caveat, evaluation, picks: Pick[] }

   A single loose type mirrors that rather than forcing one shape to cover
   both — the page branches on `enabled` exactly like the API does.
   ═══════════════════════════════════════════════════════════════════ */

export interface ScreenerPick {
    ticker: string;
    name: string;
    industry: string;
    composite_score: number;
    momentum_12m_ex_1m: number;
    annualised_volatility: number;
}

export interface ScreenerEvaluation {
    n_quarters_tested: number;
    hit_rate: number;
    top_quintile: { annual_return: number; annual_vol: number; sharpe: number; max_drawdown: number };
    nifty500_index: { annual_return: number; annual_vol: number; sharpe: number; max_drawdown: number };
}

export type ScreenerResponse =
    | { enabled: false; reason: string; evaluation?: ScreenerEvaluation }
    | {
          enabled: true;
          model_version: string;
          as_of_date: string;
          data_source: string;
          universe_size: number;
          caveat: string;
          evaluation: ScreenerEvaluation;
          picks: ScreenerPick[];
      };

export function getScreen(): Promise<Result<ScreenerResponse>> {
    return authed<ScreenerResponse>('/v1/screen');
}
