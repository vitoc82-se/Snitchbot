import { useRouter } from 'next/router';
import SnitchbotApp from '../../components/SnitchbotApp';

export default function ReportPage() {
  const { code } = useRouter().query;
  return <SnitchbotApp initialCode={code} />;
}
