#ifndef PREBTL_H
#define PREBTL_H

#include <QDialog>
#include <QtNetwork>
#include <QStandardItemModel>
#include <QMessageBox>

namespace Ui {
class preBtl;
}

class preBtl : public QDialog
{
    Q_OBJECT

public:
    explicit preBtl(QWidget *parent = nullptr);
    ~preBtl();
    void getMy();
    void getEnm();
public slots:
    void getMyPoke(const QItemSelection&,const QItemSelection&);
    void getEnmPoke(const QItemSelection&,const QItemSelection&);
signals:
    void getEnmPoke(QList<QString>&);
    void getUsrPoke(QList<QString>&);
private slots:
    void myTable(QList<QString> &poke);
    void enmTable(QList<QString> &poke);
    void on_buttonBox_accepted();
    void on_buttonBox_rejected();
private:
    Ui::preBtl *ui;
    QStandardItemModel *myPokeModel;
    QStandardItemModel *enmPokeModel;
    qint32 rowNum1;
    qint32 rowNum2;
    qint32 which;
    bool myChosen = 0;
    bool enmChosen = 0;
    QList<QString> *enmChose;
};

#endif // PREBTL_H
