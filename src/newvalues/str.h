#ifndef _FUS_STR_H_
#define _FUS_STR_H_


/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


struct fus_str {
    char *text;
    size_t len;
};


void fus_str_init(fus_str_t *s, fus_vm_t *vm,
    char *text, size_t len);
void fus_str_cleanup(fus_str_t *s);

size_t fus_str_len(fus_str_t *s);

fus_value_t fus_value_str(fus_vm_t *vm);
fus_value_t fus_value_str_len(fus_vm_t *vm, fus_value_t value);
const char *fus_value_str_decode(fus_value_t value);


#endif