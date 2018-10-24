
/*
Fancy things, too fancy for me
Plain Old C is ok for me
*/





/* The following enables POSIX extensions in C99...
like fileno() in <stdio.h> */
#if __STDC_VERSION__ >= 199901L
#define _XOPEN_SOURCE 600
#else
#define _XOPEN_SOURCE 500
#endif /* __STDC_VERSION__ */

#include <unistd.h>

