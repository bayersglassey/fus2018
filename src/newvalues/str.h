#ifndef _FUS_STR_H_
#define _FUS_STR_H_


/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


#define FUS_STR_ESCAPABLE_CHARS "\"\\"


struct fus_str {
    char *text;
    int len;
    size_t size;
};


void fus_str_init(fus_str_t *s, fus_vm_t *vm,
    char *text, int len, size_t size);
void fus_str_reinit(fus_str_t *s, char *text, int len, size_t size);
void fus_str_cleanup(fus_str_t *s);

int fus_str_len(fus_str_t *s);

fus_value_t fus_value_str(fus_vm_t *vm);
fus_value_t fus_value_str_len(fus_vm_t *vm, fus_value_t value);
const char *fus_value_str_decode(fus_value_t value);


#endif