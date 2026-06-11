import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function useAuthGuard(expectedType) {
  const navigate = useNavigate();

  useEffect(() => {
    const userId = sessionStorage.getItem('userId');
    const loginType = sessionStorage.getItem('loginType');
    const address = sessionStorage.getItem('address');

    if (!userId || !loginType || !address) {
      console.warn('未登入，導回登入頁');
      navigate('/');
      return;
    }

    if (expectedType && loginType !== expectedType) {
      console.warn(`使用者類型不符 (${loginType})，導回登入頁`);
      navigate('/');
    }
  }, [navigate, expectedType]);
}

export default useAuthGuard;