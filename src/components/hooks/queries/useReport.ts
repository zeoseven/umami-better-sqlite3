import { produce } from 'immer';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '../useApi';
import { useTimezone } from '../useTimezone';
import { useMessages } from '../useMessages';
import { parseDateRange } from '@/lib/date';

export function useReport(
  reportId: string,
  defaultParameters?: { type: string; parameters: { [key: string]: any } },
) {
  const [report, setReport] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const loadIdRef = useRef(0);
  const runIdRef = useRef(0);
  const { get, post } = useApi();
  const { timezone } = useTimezone();
  const { formatMessage, labels } = useMessages();

  const baseParameters = {
    name: formatMessage(labels.untitled),
    description: '',
    parameters: {},
  };

  const loadReport = async (id: string) => {
    const loadId = ++loadIdRef.current;
    const data: any = await get(`/reports/${id}`);

    if (loadId !== loadIdRef.current) {
      return;
    }

    const { dateRange } = data?.parameters || {};

    data.parameters = {
      ...defaultParameters?.parameters,
      ...data.parameters,
      dateRange: dateRange ? parseDateRange(dateRange?.value) : {},
    };

    setReport(data);
  };

  const runReport = useCallback(
    async (parameters: { [key: string]: any }) => {
      if (!report) {
        return;
      }

      const runId = ++runIdRef.current;

      setIsRunning(true);

      try {
        const { type } = report;

        const data = await post(`/reports/${type}`, { ...parameters, timezone });

        if (runId !== runIdRef.current) {
          return;
        }

        setReport(
          produce((state: any) => {
            state.parameters = { ...defaultParameters?.parameters, ...parameters };
            state.data = data;

            return state;
          }),
        );
      } finally {
        if (runId === runIdRef.current) {
          setIsRunning(false);
        }
      }
    },
    [report, timezone],
  );

  const updateReport = useCallback(
    async (data: { [x: string]: any; parameters: any }) => {
      setReport(state => {
        if (!state) {
          return state;
        }

        return produce(state, (draft: any) => {
          const { parameters, ...rest } = data;

          if (parameters) {
            draft.parameters = {
              ...defaultParameters?.parameters,
              ...draft.parameters,
              ...parameters,
            };
          }

          for (const key in rest) {
            draft[key] = rest[key];
          }
        });
      });
    },
    [report],
  );

  useEffect(() => {
    if (!reportId) {
      ++loadIdRef.current;
      setReport({ ...baseParameters, ...defaultParameters });
    } else {
      loadReport(reportId);
    }
  }, [reportId]);

  return { report, runReport, updateReport, isRunning };
}

export default useReport;
