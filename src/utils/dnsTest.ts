import dns from 'dns';

interface DnsResult {
  hostname: string;
  addresses?: string[];
  error?: string;
}

const testMongoDBDNS = async (): Promise<DnsResult[]> => {
  const uri = process.env.MONGODB_URI || '';
  const hostMatch = uri.match(/@([^/:]+)/);
  const hostname = hostMatch ? hostMatch[1] : 'unknown';

  return new Promise(resolve => {
    dns.resolve(hostname, (err, addresses) => {
      if (err) {
        resolve([{ hostname, error: err.message }]);
      } else {
        resolve([{ hostname, addresses }]);
      }
    });
  });
};

export default testMongoDBDNS;
